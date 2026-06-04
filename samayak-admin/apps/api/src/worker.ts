import 'dotenv/config';
import { Worker } from 'bullmq';
import { PDF_INGESTION_QUEUE, ANALYTICS_QUEUE } from './lib/queues';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { parsePdfTimetable } from './services/pdfParser';
import { computeAnalytics, invalidateAnalyticsCache } from './services/analytics';
import { Day, Period, PERIOD_TIMES, CourseType, RoomType, EntityStatus } from '@samayak/types';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';

// ─── PDF Ingestion Worker ─────────────────────────────────────────────────────

const pdfWorker = new Worker(
  PDF_INGESTION_QUEUE,
  async (job) => {
    const { jobId, filePath, originalName } = job.data as {
      jobId: string;
      filePath: string;
      originalName: string;
    };

    const updateProgress = async (progress: number, status: string) => {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { progress, status: mapStatus(progress) },
      });
      await job.updateProgress(progress);
      logger.info(`PDF Job ${jobId}: ${status} (${progress}%)`);
    };

    try {
      await updateProgress(5, 'Starting parse');

      // ── Step 1: Parse PDF ────────────────────────────────────────────────
      await prisma.importJob.update({ where: { id: jobId }, data: { status: 'PARSING' } });

      const parsed = await parsePdfTimetable(filePath, async (pct, msg) => {
        await updateProgress(Math.min(65, pct), msg);
      });

      await updateProgress(65, 'PDF parsed. Integrating entities...');

      // ── Step 2: Integrate entities into DB ──────────────────────────────
      await prisma.importJob.update({ where: { id: jobId }, data: { status: 'INTEGRATING' } });

      const result = {
        created: { departments: 0, branches: 0, rooms: 0, courses: 0, faculty: 0, slots: 0 },
        matched: { departments: 0, branches: 0, rooms: 0, courses: 0, faculty: 0 },
        pending: parsed.parseFailures,
        summary: '',
      };

      // ── 2a: Department ────────────────────────────────────────────────────
      const deptName = parsed.departmentName || 'Unknown Department';
      const deptShortCode = inferShortCode(deptName);

      let department = await prisma.department.findFirst({
        where: { OR: [{ shortCode: deptShortCode }, { name: { contains: deptName, mode: 'insensitive' } }] },
      });

      if (!department) {
        department = await prisma.department.create({ data: { name: deptName, shortCode: deptShortCode } });
        result.created.departments++;
      } else {
        result.matched.departments++;
      }

      await updateProgress(70, 'Department matched. Processing faculty...');

      // ── 2b: Faculty ───────────────────────────────────────────────────────
      const facultyMap = new Map<string, string>(); // initials → id

      for (const pf of parsed.faculty) {
        const email = `${pf.initials.toLowerCase()}@samayak.edu`;
        let faculty = await prisma.faculty.findFirst({
          where: { OR: [{ initials: pf.initials }, { email }] },
        });

        if (!faculty) {
          const passwordHash = await bcrypt.hash('Samayak@2024', 12);
          faculty = await prisma.faculty.create({
            data: {
              name: pf.fullName,
              email,
              passwordHash,
              role: 'PROFESSOR',
              departmentId: department.id,
              initials: pf.initials,
            },
          });
          result.created.faculty++;
        } else {
          result.matched.faculty++;
        }
        facultyMap.set(pf.initials, faculty.id);
      }

      await updateProgress(75, 'Faculty processed. Processing rooms...');

      // ── 2c: Rooms (extracted from cell room identifiers) ────────────────
      const allRoomStrings = new Set<string>();
      for (const row of parsed.rows) {
        for (const [, cell] of row.slots) {
          if (cell.roomId) allRoomStrings.add(cell.roomId.trim());
        }
      }

      const roomMap = new Map<string, string>(); // room string → DB id

      for (const roomStr of allRoomStrings) {
        const isLab = /lab/i.test(roomStr);
        const type: RoomType = isLab ? RoomType.LAB : RoomType.CLASSROOM;

        let room = await prisma.room.findFirst({
          where: { number: { equals: roomStr, mode: 'insensitive' }, departmentId: department.id },
        });

        if (!room) {
          room = await prisma.room.create({
            data: { number: roomStr, type, departmentId: department.id, capacity: null, status: 'PENDING' },
          });
          result.created.rooms++;
        } else {
          result.matched.rooms++;
        }
        roomMap.set(roomStr, room.id);
      }

      await updateProgress(80, 'Rooms processed. Processing branches and courses...');

      // ── 2d: Branches + Courses + Timetable Slots ─────────────────────────
      for (const row of parsed.rows) {
        // Upsert branch
        let branch = await prisma.branch.findFirst({
          where: {
            departmentId: department.id,
            semester: row.semester,
            section: row.section.includes('-') ? row.section.split('-').pop() ?? 'A' : row.section,
          },
        });

        if (!branch) {
          branch = await prisma.branch.create({
            data: {
              name: `${row.branch} Sem ${row.semester} - Section ${row.section.split('-').pop() ?? 'A'}`,
              semester: row.semester,
              section: row.section.split('-').pop() ?? 'A',
              departmentId: department.id,
            },
          });
          result.created.branches++;
        } else {
          result.matched.branches++;
        }

        // Process courses from parsed course list for this branch
        const courseMap = new Map<string, string>(); // code → id

        for (const pc of parsed.courses) {
          let course = await prisma.course.findFirst({
            where: { code: pc.code, branchId: branch.id },
          });

          if (!course) {
            course = await prisma.course.create({
              data: {
                code: pc.code,
                name: pc.name,
                credits: pc.credits,
                type: pc.type,
                branchId: branch.id,
              },
            });
            result.created.courses++;
          } else {
            result.matched.courses++;
          }
          courseMap.set(pc.code, course.id);
        }

        // Process timetable slots
        for (const [key, cell] of row.slots) {
          if (cell.isFree || !cell.courseCode) continue;

          const [dayStr, periodStr] = key.split('_') as [Day, Period];
          const periodTime = PERIOD_TIMES[periodStr];
          if (!periodTime) continue;

          // Find or infer course
          let courseId = courseMap.get(cell.courseCode ?? '');

          if (!courseId && cell.courseCode) {
            // Course not in course list — create with minimal info
            let course = await prisma.course.findFirst({
              where: { code: cell.courseCode, branchId: branch.id },
            });
            if (!course) {
              course = await prisma.course.create({
                data: {
                  code: cell.courseCode,
                  name: cell.courseCode, // name unknown
                  credits: 0,
                  type: cell.isLab ? CourseType.LAB : CourseType.LECTURE,
                  branchId: branch.id,
                  status: 'PENDING',
                },
              });
              result.created.courses++;
            }
            courseId = course.id;
            courseMap.set(cell.courseCode, courseId);
          }

          const roomDbId = cell.roomId ? roomMap.get(cell.roomId) ?? null : null;

          // Upsert slot
          await prisma.timetableSlot.upsert({
            where: { day_period_branchId: { day: dayStr, period: periodStr, branchId: branch.id } },
            create: {
              day: dayStr,
              period: periodStr,
              startTime: periodTime.start,
              endTime: periodTime.end,
              roomId: roomDbId,
              courseId: courseId ?? null,
              branchId: branch.id,
            },
            update: {
              roomId: roomDbId,
              courseId: courseId ?? null,
            },
          });

          // Link faculty to course
          if (cell.facultyInitials && courseId) {
            const initials = cell.facultyInitials.split('+');
            for (const initial of initials) {
              const facultyId = facultyMap.get(initial.trim());
              if (facultyId) {
                await prisma.facultyCourse.upsert({
                  where: { facultyId_courseId: { facultyId, courseId } },
                  create: { facultyId, courseId },
                  update: {},
                });
              }
            }
          }

          result.created.slots++;
        }
      }

      await updateProgress(90, 'Entities integrated. Recomputing analytics...');

      // ── Step 3: Trigger analytics recompute ──────────────────────────────
      await invalidateAnalyticsCache();
      await computeAnalytics();

      result.summary = `Created: ${result.created.departments} dept, ${result.created.branches} branches, ${result.created.rooms} rooms, ${result.created.courses} courses, ${result.created.faculty} faculty, ${result.created.slots} slots. Matched: ${result.matched.departments + result.matched.branches + result.matched.rooms + result.matched.courses + result.matched.faculty} existing records. Pending: ${result.pending.length} parse failures.`;

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'DONE', progress: 100, result },
      });

      logger.info(`PDF ingestion job ${jobId} completed`, result);

      // Cleanup uploaded file
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`PDF ingestion job ${jobId} failed`, { error: errorMsg });

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: errorMsg, progress: 0 },
      });

      // Cleanup
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }

      throw error;
    }
  },
  { connection: redis, concurrency: 2 }
);

// ─── Analytics Worker ─────────────────────────────────────────────────────────

const analyticsWorker = new Worker(
  ANALYTICS_QUEUE,
  async (_job) => {
    await invalidateAnalyticsCache();
    await computeAnalytics();
    logger.info('Analytics recomputed by worker');
  },
  { connection: redis, concurrency: 1 }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(progress: number) {
  if (progress < 10) return 'QUEUED';
  if (progress < 65) return 'PARSING';
  if (progress < 90) return 'INTEGRATING';
  return 'DONE';
}

function inferShortCode(deptName: string): string {
  const words = deptName.toUpperCase().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 6);
  return words.map((w) => w[0]).join('').slice(0, 8);
}

pdfWorker.on('failed', (job, err) => {
  logger.error(`PDF worker job failed: ${job?.id}`, { error: err.message });
});

analyticsWorker.on('failed', (job, err) => {
  logger.error(`Analytics worker job failed: ${job?.id}`, { error: err.message });
});

logger.info('BullMQ workers started: pdf-ingestion, analytics');
