import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getDashboardAnalytics, invalidateAnalyticsCache, computeAnalytics } from '../services/analytics';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// GET /api/analytics/dashboard
analyticsRouter.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getDashboardAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/analytics/recompute (force recompute, invalidates cache)
analyticsRouter.post('/recompute', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await invalidateAnalyticsCache();
    const data = await computeAnalytics();
    res.json({ success: true, data, message: 'Analytics recomputed' });
  } catch (err) {
    next(err);
  }
});
