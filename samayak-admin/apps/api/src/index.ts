import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authRouter } from './routes/auth';
import { departmentsRouter } from './routes/departments';
import { roomsRouter } from './routes/rooms';
import { coursesRouter } from './routes/courses';
import { facultyRouter } from './routes/faculty';
import { timetableRouter } from './routes/timetable';
import { analyticsRouter } from './routes/analytics';
import { healthRouter } from './routes/health';
import { logger } from './lib/logger';

const app = express();
const PORT = process.env['API_PORT'] ?? 4000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(correlationIdMiddleware);
app.use(requestLogger);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/faculty', facultyRouter);
app.use('/api/timetable', timetableRouter);
app.use('/api/analytics', analyticsRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Samayak API running on port ${PORT}`);
});

export default app;
