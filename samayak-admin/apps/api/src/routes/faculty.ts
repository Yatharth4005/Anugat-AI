import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as fs from 'fs';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { parseCsvOrExcel } from '../services/importParser';
import multer from 'multer';
import { Role } from '@samayak/types';

export const facultyRouter = Router();
facultyRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const createFacultySchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8).optional().default('Samayak@2024'),
  role: z.nativeEnum(Role).default(Role.PROFESSOR),
  departmentId: z.string().uuid().optional().nullable(),
  initials: z.string().min(1).max(10).toUpperCase(),
});

const updateFacultySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  initials: z.string().min(1).max(10).toUpperCase().optional(),
});

// GET /api/faculty
facultyRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize']) || 20));
    const search = (req.query['search'] as string) || '';
    const role = req.query['role'] as Role | undefined;
    const departmentId = req.query['departmentId'] as string | undefined;
    const showArchived = req.query['archived'] === 'true';

    const where: Record<string, unknown> = {
      deletedAt: showArchived ? { not: null } : null,
    };
    if (!showArchived) where['status'] = 'ACTIVE';
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { initials: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where['role'] = role;
    if (departmentId) where['departmentId'] = departmentId;

    const [total, faculty] = await Promise.all([
      prisma.faculty.count({ where }),
      prisma.faculty.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, role: true, initials: true,
          departmentId: true, status: true, deletedAt: true, createdAt: true,
          department: { select: { id: true, name: true, shortCode: true } },
          _count: { select: { courses: true } },
        },
      }),
    ]);

    res.json({ success: true, data: faculty, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// POST /api/faculty
facultyRouter.post('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, ...rest } = createFacultySchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password ?? 'Samayak@2024', 12);
    const faculty = await prisma.faculty.create({
      data: { ...rest, passwordHash, departmentId: rest.departmentId ?? null },
      select: { id: true, name: true, email: true, role: true, initials: true, departmentId: true },
    });
    res.status(201).json({ success: true, data: faculty });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/faculty/:id
facultyRouter.patch('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateFacultySchema.parse(req.body);
    const faculty = await prisma.faculty.update({
      where: { id: req.params['id'] as string },
      data,
      select: { id: true, name: true, email: true, role: true, initials: true, departmentId: true },
    });
    res.json({ success: true, data: faculty });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/faculty/:id (soft delete — recoverable)
facultyRouter.delete('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faculty = await prisma.faculty.update({
      where: { id: req.params['id'] as string },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    res.json({ success: true, message: 'Faculty member archived. Recoverable within 30 days.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/faculty/:id/restore
facultyRouter.post('/:id/restore', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faculty = await prisma.faculty.findUnique({ where: { id: req.params['id'] as string } });
    if (!faculty?.deletedAt) throw new AppError(400, 'Faculty member is not archived');

    const daysSinceDelete = (Date.now() - faculty.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDelete > 30) throw new AppError(400, 'Recovery window expired (30 days)');

    await prisma.faculty.update({
      where: { id: req.params['id'] as string },
      data: { deletedAt: null, status: 'ACTIVE' },
    });
    res.json({ success: true, message: 'Faculty member restored' });
  } catch (err) {
    next(err);
  }
});

// POST /api/faculty/import/preview
facultyRouter.post('/import/preview', adminOnly, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');
    const rows = await parseCsvOrExcel(req.file.buffer, req.file.mimetype);
    const preview = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawEmail = row['email'] || row['Email'] || row['EMAIL'];
      const email = rawEmail ? String(rawEmail).trim() : '';
      const existing = email ? await prisma.faculty.findUnique({ where: { email } }) : null;

      // Resolve department
      const deptSearch = String(row['department'] || row['Department'] || row['DEPARTMENT'] || row['departmentShortCode'] || row['shortCode'] || row['Short Code'] || '').trim();
      let departmentId: string | null = null;
      let departmentName: string | null = null;

      if (deptSearch) {
        const dept = await prisma.department.findFirst({
          where: {
            OR: [
              { shortCode: { equals: deptSearch, mode: 'insensitive' } },
              { name: { equals: deptSearch, mode: 'insensitive' } },
            ],
          },
        });
        if (dept) {
          departmentId = dept.id;
          departmentName = dept.name;
        }
      }

      let roleVal = String(row['role'] || row['Role'] || row['ROLE'] || 'PROFESSOR').toUpperCase().trim();
      if (!Object.values(Role).includes(roleVal as Role)) {
        roleVal = 'PROFESSOR';
      }

      preview.push({
        rowIndex: i + 2,
        name: String(row['name'] || row['Name'] || row['NAME'] || '').trim(),
        email,
        role: roleVal,
        initials: String(row['initials'] || row['Initials'] || '').trim().toUpperCase(),
        departmentId,
        departmentName: departmentName || (deptSearch ? `${deptSearch} (Not Found)` : ''),
        status: existing ? 'DUPLICATE' : 'NEW',
        existingRecord: existing ? { id: existing.id, name: existing.name } : null,
      });
    }

    res.json({ success: true, data: preview });
  } catch (err) {
    next(err);
  }
});

// POST /api/faculty/import/commit
facultyRouter.post('/import/commit', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let validated;
    try {
      validated = z.object({
        rows: z.array(z.object({
          name: z.string(),
          email: z.string().email(),
          role: z.nativeEnum(Role).default(Role.PROFESSOR),
          initials: z.string(),
          departmentId: z.string().optional().nullable(),
        })),
        duplicateAction: z.enum(['skip', 'merge']).default('skip'),
      }).parse(req.body);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        fs.writeFileSync('f:/Anugat AI/zod_error_log.txt', JSON.stringify({ body: req.body, errors: e.errors }, null, 2));
      }
      throw e;
    }
    const { rows, duplicateAction } = validated;

    const results = { created: 0, merged: 0, skipped: 0, errors: [] as { email: string; error: string }[] };

    for (const row of rows) {
      try {
        const existing = await prisma.faculty.findUnique({ where: { email: row.email } });
        const passwordHash = await bcrypt.hash('Samayak@2024', 12);

        if (existing) {
          if (duplicateAction === 'merge') {
            await prisma.faculty.update({
              where: { id: existing.id },
              data: { name: row.name, role: row.role, initials: row.initials },
            });
            results.merged++;
          } else {
            results.skipped++;
          }
        } else {
          await prisma.faculty.create({
            data: { ...row, passwordHash, departmentId: row.departmentId ?? null },
          });
          results.created++;
        }
      } catch (e: unknown) {
        results.errors.push({ email: row.email, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});
