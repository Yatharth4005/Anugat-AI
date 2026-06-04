import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error with correlation ID
  logger.error('Request error', {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: process.env['NODE_ENV'] !== 'production' ? err.stack : undefined,
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Prisma unique constraint violations
  if (err.message.includes('Unique constraint failed')) {
    res.status(409).json({
      success: false,
      error: 'A record with this identifier already exists',
    });
    return;
  }

  // Generic server errors — don't leak internals in production
  res.status(500).json({
    success: false,
    error: process.env['NODE_ENV'] === 'production'
      ? 'Internal server error'
      : err.message,
  });
}
