import { Queue } from 'bullmq';
import { bullConnection } from '../redis.js';

export const settlementQueue = new Queue('settlement', { connection: bullConnection });
export const commissionQueue = new Queue('commission', { connection: bullConnection });
export const notificationQueue = new Queue('notification', { connection: bullConnection });
export const anomalyQueue = new Queue('anomaly', { connection: bullConnection });
export const backupQueue = new Queue('backup', { connection: bullConnection });

/**
 * 启动期注册重复任务（BullMQ repeatable jobs）
 */
export async function ensureRepeatableJobs(): Promise<void> {
  // 异常扫描：每 60 秒
  await anomalyQueue.add(
    'scan',
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 100, removeOnFail: 100 }
  );
  // 备份任务：每天 03:00（cron）
  await backupQueue.add(
    'daily-backup',
    {},
    {
      repeat: { pattern: '0 3 * * *', tz: 'UTC' },
      removeOnComplete: 30,
      removeOnFail: 30,
    }
  );
}
