import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { invalidateAnalyticsCache } from '../services/analytics';
import { parseCsvOrExcel } from '../services/importParser';
import multer from 'multer';
import { RoomType } from '@samayak/types';

export const roomsRouter = Router();
roomsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const createRoomSchema = z.object({
  number: z.string().min(1).max(100),
  type: z.nativeEnum(RoomType).default(RoomType.CLASSROOM),
  capacity: z.number().int().positive().nullable().optional(),
  departmentId: z.string().uuid(),
});

const updateRoomSchema = createRoomSchema.partial();

// GET /api/rooms
roomsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize']) || 20));
    const search = (req.query['search'] as string) || '';
    const type = req.query['type'] as RoomType | undefined;
    const departmentId = req.query['departmentId'] as string | undefined;

    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (search) where['number'] = { contains: search, mode: 'insensitive' };
    if (type) where['type'] = type;
    if (departmentId) where['departmentId'] = departmentId;

    const [total, rooms] = await Promise.all([
      prisma.room.count({ where }),
      prisma.room.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { number: 'asc' },
        include: { department: { select: { id: true, name: true, shortCode: true } } },
      }),
    ]);

    res.json({ success: true, data: rooms, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms/:id
roomsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params['id'] },
      include: { department: true },
    });
    if (!room) throw new AppError(404, 'Room not found');
    res.json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms
roomsRouter.post('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRoomSchema.parse(req.body);
    const room = await prisma.room.create({ data: { ...data, capacity: data.capacity ?? null } });
    await invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/rooms/:id
roomsRouter.patch('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateRoomSchema.parse(req.body);
    const room = await prisma.room.update({ where: { id: req.params['id'] }, data });
    await invalidateAnalyticsCache();
    res.json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/rooms/:id
roomsRouter.delete('/:id', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slotCount = await prisma.timetableSlot.count({ where: { roomId: req.params['id'] } });
    if (slotCount > 0 && !req.query['force']) {
      res.status(409).json({
        success: false,
        error: `Room is used in ${slotCount} timetable slot(s). Add ?force=true to unassign and delete.`,
      });
      return;
    }
    if (slotCount > 0) {
      await prisma.timetableSlot.updateMany({ where: { roomId: req.params['id'] }, data: { roomId: null } });
    }
    await prisma.room.delete({ where: { id: req.params['id'] } });
    await invalidateAnalyticsCache();
    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/rooms/import
roomsRouter.post('/import', adminOnly, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');
    const rows = await parseCsvOrExcel(req.file.buffer, req.file.mimetype);
    const results = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const data = createRoomSchema.parse({
          number: row['number'] || row['Room Number'] || row['ROOM'],
          type: row['type'] || row['Type'] || row['ROOM TYPE'] || 'CLASSROOM',
          capacity: row['capacity'] ? Number(row['capacity']) : null,
          departmentId: row['departmentId'] || row['Department ID'],
        });

        await prisma.room.upsert({
          where: { number_departmentId: { number: data.number, departmentId: data.departmentId } },
          create: data,
          update: { capacity: data.capacity, type: data.type },
        });
        results.created++;
      } catch (e: unknown) {
        results.errors.push({ row: i + 2, error: e instanceof Error ? e.message : 'Unknown error' });
        results.skipped++;
      }
    }

    await invalidateAnalyticsCache();
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});
