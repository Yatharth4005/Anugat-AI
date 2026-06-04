import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

prisma.$on('error' as never, (e: unknown) => {
  logger.error('Prisma error', { error: e });
});

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn('Prisma warning', { warning: e });
});

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
