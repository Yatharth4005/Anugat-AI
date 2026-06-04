import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { authenticate, adminOnly } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { pdfIngestionQueue } from '../lib/queues';
import { logger } from '../lib/logger';

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
    const job = await prisma.importJob.findUnique({ where: { id: req.params['id'] } });
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
