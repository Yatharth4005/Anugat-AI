import { Queue } from 'bullmq';
import { redis } from './redis';

export const PDF_INGESTION_QUEUE = 'pdf-ingestion';
export const BULK_IMPORT_QUEUE = 'bulk-import';
export const ANALYTICS_QUEUE = 'analytics';

export const pdfIngestionQueue = new Queue(PDF_INGESTION_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export const bulkImportQueue = new Queue(BULK_IMPORT_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export const analyticsQueue = new Queue(ANALYTICS_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 300 },
    removeOnFail: { age: 3600 },
  },
});
