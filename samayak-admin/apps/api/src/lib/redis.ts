import Redis from 'ioredis';
import { logger } from './logger';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    redisInstance.on('connect', () => logger.info('Redis connected'));
    redisInstance.on('error', (err) => logger.error('Redis error', { error: err.message }));
    redisInstance.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisInstance;
}

export const redis = getRedis();
