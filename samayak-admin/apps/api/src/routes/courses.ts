import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { parseCsvOrExcel } from '../services/importParser';
import multer from 'multer';
import { CourseType } from '@samayak/types';

export const coursesRouter = Router();
coursesRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const createCourseSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(300),
  credits: z.number().min(0).max(20),
  type: z.nativeEnum(CourseType).default(CourseType.LECTURE),
  branchId: z.string().uuid(),
});

const updateCourseSchema = createCourseSchema.partial();

// GET /api/courses
coursesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize']) || 20));
    const search = (req.query['search'] as string) || '';
    const branchId = req.query['branchId'] as string | undefined;
    const departmentId = req.query['departmentId'] as string | undefined;
    const semester = req.query['semester'] ? Number(req.query['semester']) : undefined;
    const type = req.query['type'] as CourseType | undefined;

    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (search) {
      where['OR'] = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (branchId) where['branchId'] = branchId;
    if (type) where['type'] = type;
    if (departmentId || semester) {
      where['branch'] = {};
      if (departmentId) (where['branch'] as Record<string, unknown>)['departmentId'] = departmentId;
      if (semester) (where['branch'] as Record<string, unknown>)['semester'] = semester;
    }

    const [total, courses] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: {
            select: { id: true, name: true, semester: true, section: true, departmentId: true },
          },
          faculty: {
            include: { faculty: { select: { id: true, name: true, initials: true } } },
          },
          _count: { select: { timetableSlots: true } },
        },
      }),
    ]);

    res.json({ success: true, data: courses, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/courses/:id
coursesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        branch: { include: { department: true } },
        faculty: { include: { faculty: true } },
        timetableSlots: true,
      },
    });
    if (!course) throw new AppError(404, 'Course not found');
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses
coursesRouter.post('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCourseSchema.parse(req.body);
    const course = await prisma.course.create({ data });
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/courses/:id
coursesRouter.patch('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateCourseSchema.parse(req.body);
    const course = await prisma.course.update({ where: { id: req.params['id'] as string }, data });
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/courses/:id
coursesRouter.delete('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.course.update({
      where: { id: req.params['id'] as string },
      data: { status: 'ARCHIVED' },
    });
    res.json({ success: true, message: 'Course archived' });
  } catch (err) {
    next(err);
  }
});

// POST /api/courses/import
coursesRouter.post('/import', adminOnly, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');
    const rows = await parseCsvOrExcel(req.file.buffer, req.file.mimetype);
    const results = { created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let branchId = row['branchId'] || row['Branch ID'] || row['branch_id'];

        if (!branchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(branchId))) {
          // Resolve branch from dept + sem + sec
          const deptSearch = String(
            row['department'] || 
            row['Department'] || 
            row['DEPARTMENT'] || 
            row['departmentShortCode'] || 
            row['Department Short Code'] || 
            row['department_short_code'] || 
            row['DepartmentShortCode'] || 
            row['shortCode'] || 
            row['Short Code'] || 
            row['SHORT CODE'] || 
            ''
          ).trim();
          const semRaw = String(row['semester'] || row['Semester'] || row['SEM'] || row['Sem'] || row['SEMESTER'] || '').trim();
          const section = String(row['section'] || row['Section'] || row['SEC'] || row['Sec'] || row['SECTION'] || 'A').trim();

          if (!deptSearch) {
            throw new Error('Department (name or code) is required to resolve branch');
          }
          if (!semRaw) {
            throw new Error('Semester is required to resolve branch');
          }

          // Convert roman to decimal if needed
          let semester = parseInt(semRaw, 10);
          if (isNaN(semester)) {
            const romanMap: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
            semester = romanMap[semRaw.toUpperCase()] || 1;
          }

          const dept = await prisma.department.findFirst({
            where: {
              OR: [
                { shortCode: { equals: deptSearch, mode: 'insensitive' } },
                { name: { equals: deptSearch, mode: 'insensitive' } },
              ],
            },
          });

          if (!dept) {
            throw new Error(`Department "${deptSearch}" not found`);
          }

          let branch = await prisma.branch.findFirst({
            where: {
              departmentId: dept.id,
              semester,
              section,
            },
          });

          if (!branch) {
            branch = await prisma.branch.create({
              data: {
                name: `${dept.shortCode} Sem ${semester} - Section ${section}`,
                semester,
                section,
                departmentId: dept.id,
              },
            });
          }

          branchId = branch.id;
        }

        const rawCredits = row['credits'] || row['Credits'] || row['CREDITS'] || '';
        const creditsString = String(rawCredits).replace(/[^\d.]/g, '');
        const credits = creditsString ? Number(creditsString) : 0;

        const data = createCourseSchema.parse({
          code: String(row['code'] || row['Course Code'] || row['CODE'] || '').trim().toUpperCase(),
          name: String(row['name'] || row['Course Name'] || row['NAME'] || '').trim(),
          credits,
          type: String(row['type'] || row['Type'] || 'LECTURE').toUpperCase(),
          branchId,
        });

        await prisma.course.upsert({
          where: { code_branchId: { code: data.code, branchId: data.branchId } },
          create: data,
          update: { name: data.name, credits: data.credits, type: data.type },
        });
        results.created++;
      } catch (e: unknown) {
        results.errors.push({ row: i + 2, error: e instanceof Error ? e.message : 'Unknown error' });
        results.skipped++;
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});
