import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { invalidateAnalyticsCache } from '../services/analytics';
import { parseCsvOrExcel } from '../services/importParser';
import multer from 'multer';

export const departmentsRouter = Router();
departmentsRouter.use(authenticate);

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const createDeptSchema = z.object({
  name: z.string().min(2).max(200),
  shortCode: z.string().min(2).max(20).toUpperCase(),
});

const updateDeptSchema = createDeptSchema.partial();

// GET /api/departments
departmentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize']) || 20));
    const search = (req.query['search'] as string) || '';

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { shortCode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, departments] = await Promise.all([
      prisma.department.count({ where }),
      prisma.department.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { branches: true, rooms: true, faculty: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: departments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/departments/:id
departmentsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        branches: { orderBy: [{ semester: 'asc' }, { section: 'asc' }] },
        _count: { select: { rooms: true, faculty: true } },
      },
    });
    if (!dept) throw new AppError(404, 'Department not found');
    res.json({ success: true, data: dept });
  } catch (err) {
    next(err);
  }
});

// POST /api/departments
departmentsRouter.post('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDeptSchema.parse(req.body);
    const dept = await prisma.department.create({ data });
    res.status(201).json({ success: true, data: dept });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/departments/:id
departmentsRouter.patch('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateDeptSchema.parse(req.body);
    const dept = await prisma.department.update({
      where: { id: req.params['id'] as string },
      data,
    });
    res.json({ success: true, data: dept });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/departments/:id
departmentsRouter.delete('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;

    // Check for dependent records
    const counts = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { branches: true, rooms: true, faculty: true } },
      },
    });

    if (!counts) throw new AppError(404, 'Department not found');

    const countsAny = counts as any;
    const totalDeps = countsAny._count.branches + countsAny._count.rooms + countsAny._count.faculty;
    if (totalDeps > 0 && !req.query['force']) {
      res.status(409).json({
        success: false,
        error: 'Department has dependent records',
        details: {
          branches: countsAny._count.branches,
          rooms: countsAny._count.rooms,
          faculty: countsAny._count.faculty,
          total: totalDeps,
        },
        hint: 'Add ?force=true to delete all dependent records',
      });
      return;
    }

    await prisma.department.delete({ where: { id } });
    await invalidateAnalyticsCache();
    res.json({ success: true, message: 'Department deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/departments/import
departmentsRouter.post('/import', adminOnly, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');

    const rows = await parseCsvOrExcel(req.file.buffer, req.file.mimetype);
    const results = { created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const data = createDeptSchema.parse({
          name: row['name'] || row['Name'] || row['DEPARTMENT NAME'],
          shortCode: String(row['shortCode'] || row['Short Code'] || row['CODE'] || '').toUpperCase(),
        });

        await prisma.department.upsert({
          where: { shortCode: data.shortCode },
          create: data,
          update: { name: data.name },
        });
        results.created++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        results.errors.push({ row: i + 2, error: msg });
        results.skipped++;
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});
