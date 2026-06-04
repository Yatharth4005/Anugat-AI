import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { pdfIngestionQueue } from '../lib/queues';
import { logger } from '../lib/logger';

export const healthRouter = Router();

// GET /api/health
healthRouter.get('/', async (_req: Request, res: Response) => {
  const results = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
    pdfIngestionQueue.getWorkers(),
  ]);

  const dbOk = results[0].status === 'fulfilled';
  const redisOk = results[1].status === 'fulfilled';
  const queueOk = results[2].status === 'fulfilled';

  const status = dbOk && redisOk ? 'ok' : 'degraded';

  if (status === 'degraded') {
    logger.warn('Health check degraded', {
      db: dbOk,
      redis: redisOk,
      queue: queueOk,
    });
  }

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    db: dbOk ? 'connected' : 'disconnected',
    redis: redisOk ? 'connected' : 'disconnected',
    queue: queueOk ? 'active' : 'inactive',
    timestamp: new Date().toISOString(),
  });
});
