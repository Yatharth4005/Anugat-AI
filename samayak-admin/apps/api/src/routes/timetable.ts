import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { pdfIngestionQueue } from '../lib/queues';
import { logger } from '../lib/logger';
import { invalidateAnalyticsCache, computeAnalytics } from '../services/analytics';

export const timetableRouter = Router();
timetableRouter.use(authenticate);

// Store PDFs temporarily on disk for worker to access
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

// POST /api/timetable/ingest — upload PDF → enqueue BullMQ job
timetableRouter.post(
  '/ingest',
  adminOnly,
  pdfUpload.single('pdf'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No PDF file uploaded');

      // Create job record in DB
      const jobRecord = await prisma.importJob.create({
        data: {
          status: 'QUEUED',
          fileName: req.file.originalname,
          fileType: 'PDF',
          progress: 0,
        },
      });

      // Enqueue BullMQ job with file path
      await pdfIngestionQueue.add(
        'ingest-pdf',
        {
          jobId: jobRecord.id,
          filePath: req.file.path,
          originalName: req.file.originalname,
        },
        { jobId: jobRecord.id }
      );

      logger.info('PDF ingestion job queued', {
        jobId: jobRecord.id,
        fileName: req.file.originalname,
        correlationId: req.correlationId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: jobRecord.id,
          status: 'QUEUED',
          message: 'PDF queued for processing. Poll /api/timetable/job/:id for status.',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/timetable/job/:id — poll job status
timetableRouter.get('/job/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.importJob.findUnique({ where: { id: req.params['id'] as string } });
    if (!job) throw new AppError(404, 'Import job not found');
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

// GET /api/timetable/jobs — list recent jobs
timetableRouter.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/timetable/reset — reset imported timetable data to seed baseline
timetableRouter.delete('/reset', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Resetting database to seed baseline...');

    // Delete imported records
    await prisma.timetableSlot.deleteMany();
    await prisma.course.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.facultyCourse.deleteMany();
    await prisma.faculty.deleteMany({ where: { role: 'PROFESSOR' } });
    await prisma.room.deleteMany({
      where: { OR: [{ status: 'PENDING' }, { NOT: { number: { in: ['219', '220', '301', 'Lab 1', 'Lab 2', 'OOPDP Lab', 'Network Lab', '115', 'IT Lab 1', 'MCA Hall', 'MCA Lab'] } } }] }
    });
    await prisma.department.deleteMany({
      where: { NOT: { shortCode: { in: ['CSE', 'IT', 'MCA'] } } }
    });
    await prisma.importJob.deleteMany();

    // Re-upsert baseline seeded data
    const cse = await prisma.department.upsert({
      where: { shortCode: 'CSE' },
      update: {},
      create: { name: 'Computer Science & Engineering', shortCode: 'CSE' },
    });
    const it = await prisma.department.upsert({
      where: { shortCode: 'IT' },
      update: {},
      create: { name: 'Information Technology', shortCode: 'IT' },
    });
    const mca = await prisma.department.upsert({
      where: { shortCode: 'MCA' },
      update: {},
      create: { name: 'Master of Computer Applications', shortCode: 'MCA' },
    });

    const roomData = [
      { number: '219', type: 'CLASSROOM' as const, capacity: 60, departmentId: cse.id },
      { number: '220', type: 'CLASSROOM' as const, capacity: 60, departmentId: cse.id },
      { number: '301', type: 'CLASSROOM' as const, capacity: 80, departmentId: cse.id },
      { number: 'Lab 1', type: 'LAB' as const, capacity: 40, departmentId: cse.id },
      { number: 'Lab 2', type: 'LAB' as const, capacity: 40, departmentId: cse.id },
      { number: 'OOPDP Lab', type: 'LAB' as const, capacity: 36, departmentId: cse.id },
      { number: 'Network Lab', type: 'LAB' as const, capacity: 32, departmentId: cse.id },
      { number: '115', type: 'CLASSROOM' as const, capacity: 70, departmentId: it.id },
      { number: 'IT Lab 1', type: 'LAB' as const, capacity: 36, departmentId: it.id },
      { number: 'MCA Hall', type: 'CLASSROOM' as const, capacity: 60, departmentId: mca.id },
      { number: 'MCA Lab', type: 'LAB' as const, capacity: 30, departmentId: mca.id },
    ];
    for (const room of roomData) {
      await prisma.room.upsert({
        where: { number_departmentId: { number: room.number, departmentId: room.departmentId } },
        update: {},
        create: room,
      });
    }

    const branchCSE6A = await prisma.branch.upsert({
      where: { departmentId_semester_section: { departmentId: cse.id, semester: 6, section: 'A' } },
      update: {},
      create: { name: 'B.Tech CSE VI Sem - Section A', semester: 6, section: 'A', departmentId: cse.id },
    });
    const branchCSE6B = await prisma.branch.upsert({
      where: { departmentId_semester_section: { departmentId: cse.id, semester: 6, section: 'B' } },
      update: {},
      create: { name: 'B.Tech CSE VI Sem - Section B', semester: 6, section: 'B', departmentId: cse.id },
    });
    const branchMCA2 = await prisma.branch.upsert({
      where: { departmentId_semester_section: { departmentId: mca.id, semester: 2, section: 'A' } },
      update: {},
      create: { name: 'MCA II Sem', semester: 2, section: 'A', departmentId: mca.id },
    });

    const defaultHash = await bcrypt.hash('Samayak@2024', 12);
    const demoFaculty = [
      { name: 'Dr. Vandana K. Bhattacherjee', email: 'vkb@samayak.edu', initials: 'VKB' },
      { name: 'Dr. Deepak Kumar Mahto', email: 'dkm@samayak.edu', initials: 'DKM' },
      { name: 'Dr. Pragati Shukla', email: 'ps@samayak.edu', initials: 'PS' },
      { name: 'Dr. Arunima Jaiswal', email: 'aj@samayak.edu', initials: 'AJ' },
      { name: 'Dr. Neeraj Kumar Singh', email: 'nks@samayak.edu', initials: 'NKS' },
      { name: 'Prof. Supriya Sinha', email: 'ss@samayak.edu', initials: 'SS' },
      { name: 'Dr. Rajesh Kumar', email: 'rk@samayak.edu', initials: 'RK' },
    ];
    const facultyMap: Record<string, string> = {};
    for (const f of demoFaculty) {
      const member = await prisma.faculty.upsert({
        where: { email: f.email },
        update: {},
        create: {
          name: f.name,
          email: f.email,
          passwordHash: defaultHash,
          role: 'PROFESSOR',
          initials: f.initials,
          departmentId: cse.id,
        },
      });
      facultyMap[f.initials] = member.id;
    }

    const courses = [
      { code: 'CS301', name: 'Operating Systems', credits: 4, type: 'LECTURE' as const, branchId: branchCSE6A.id },
      { code: 'CS302', name: 'Computer Networks', credits: 4, type: 'LECTURE' as const, branchId: branchCSE6A.id },
      { code: 'CS303', name: 'Software Engineering', credits: 3, type: 'LECTURE' as const, branchId: branchCSE6A.id },
      { code: 'CS304', name: 'Database Management Systems', credits: 4, type: 'LECTURE' as const, branchId: branchCSE6A.id },
      { code: 'CS305', name: 'CS301 Lab', credits: 2, type: 'LAB' as const, branchId: branchCSE6A.id },
      { code: 'CS306', name: 'Networks Lab', credits: 2, type: 'LAB' as const, branchId: branchCSE6A.id },
      { code: 'CS301', name: 'Operating Systems', credits: 4, type: 'LECTURE' as const, branchId: branchCSE6B.id },
      { code: 'CS302', name: 'Computer Networks', credits: 4, type: 'LECTURE' as const, branchId: branchCSE6B.id },
      { code: 'CS303', name: 'Software Engineering', credits: 3, type: 'LECTURE' as const, branchId: branchCSE6B.id },
      { code: 'MCA201', name: 'Advanced Algorithms', credits: 4, type: 'LECTURE' as const, branchId: branchMCA2.id },
      { code: 'MCA202', name: 'Web Technologies', credits: 3, type: 'LECTURE' as const, branchId: branchMCA2.id },
    ];
    const courseMap: Record<string, string> = {};
    for (const c of courses) {
      const course = await prisma.course.upsert({
        where: { code_branchId: { code: c.code, branchId: c.branchId } },
        update: {},
        create: c,
      });
      courseMap[`${c.code}_${c.branchId}`] = course.id;
    }

    const sampleSlots = [
      { day: 'MONDAY' as const, period: 'I' as const, roomId: '219', courseCode: 'CS301', startTime: '09:00', endTime: '09:50' },
      { day: 'MONDAY' as const, period: 'II' as const, roomId: '219', courseCode: 'CS302', startTime: '10:00', endTime: '10:50' },
      { day: 'MONDAY' as const, period: 'III' as const, roomId: '220', courseCode: 'CS303', startTime: '11:00', endTime: '11:50' },
      { day: 'MONDAY' as const, period: 'IV' as const, roomId: '219', courseCode: 'CS304', startTime: '12:00', endTime: '12:50' },
      { day: 'TUESDAY' as const, period: 'I' as const, roomId: '220', courseCode: 'CS302', startTime: '09:00', endTime: '09:50' },
      { day: 'TUESDAY' as const, period: 'II' as const, roomId: '219', courseCode: 'CS301', startTime: '10:00', endTime: '10:50' },
      { day: 'TUESDAY' as const, period: 'V' as const, roomId: 'Lab 1', courseCode: 'CS305', startTime: '13:00', endTime: '13:50' },
      { day: 'WEDNESDAY' as const, period: 'I' as const, roomId: '219', courseCode: 'CS304', startTime: '09:00', endTime: '09:50' },
      { day: 'WEDNESDAY' as const, period: 'III' as const, roomId: '220', courseCode: 'CS303', startTime: '11:00', endTime: '11:50' },
      { day: 'THURSDAY' as const, period: 'II' as const, roomId: 'Lab 1', courseCode: 'CS306', startTime: '10:00', endTime: '10:50' },
      { day: 'FRIDAY' as const, period: 'I' as const, roomId: '220', courseCode: 'CS301', startTime: '09:00', endTime: '09:50' },
      { day: 'FRIDAY' as const, period: 'III' as const, roomId: '219', courseCode: 'CS302', startTime: '11:00', endTime: '11:50' },
    ];
    for (const slot of sampleSlots) {
      const courseId = courseMap[`${slot.courseCode}_${branchCSE6A.id}`];
      const room = await prisma.room.findFirst({ where: { number: slot.roomId, departmentId: cse.id } });
      if (!courseId || !room) continue;
      await prisma.timetableSlot.create({
        data: {
          day: slot.day,
          period: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          roomId: room.id,
          courseId,
          branchId: branchCSE6A.id,
        },
      });
    }

    // Trigger recompute
    await invalidateAnalyticsCache();
    await computeAnalytics();

    res.json({
      success: true,
      message: 'Database reset to seed baseline successfully, and analytics recomputed.',
    });
  } catch (err) {
    next(err);
  }
});
