import { Worker } from 'bullmq';
import { bullConnection } from '../redis.js';
import { settleTrade } from '../services/tradeEngine.js';
import {
  sendEmail,
  sendTelegram,
  sendWebPush,
} from '../services/notificationDispatch.js';
import { runAnomalyScan } from '../services/anomalyService.js';
import { runDailyBackup } from '../services/backupService.js';
import { logger } from '../logger.js';

let workersStarted = false;

export function startWorkers(): void {
  if (workersStarted) return;
  workersStarted = true;

  // 结算 worker
  const settlementWorker = new Worker(
    'settlement',
    async (job) => {
      const { tradeId } = job.data as { tradeId: number };
      await settleTrade(tradeId);
      return { settled: tradeId };
    },
    {
      connection: bullConnection,
      concurrency: 20,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );

  settlementWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[worker:settlement] failed');
  });
  settlementWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id, data: job.returnvalue }, '[worker:settlement] done');
  });

  // 通知 worker：按渠道异步投递（email / telegram / webpush）
  const notificationWorker = new Worker(
    'notification',
    async (job) => {
      const data = job.data as {
        userId: number;
        channel: 'email' | 'telegram' | 'webpush';
        title: string;
        content: string;
      };
      switch (data.channel) {
        case 'email':
          await sendEmail({
            userId: data.userId,
            subject: data.title,
            html: data.content,
          });
          break;
        case 'telegram':
          await sendTelegram({
            userId: data.userId,
            text: `<b>${escapeHtml(data.title)}</b>\n\n${escapeHtml(data.content)}`,
          });
          break;
        case 'webpush':
          await sendWebPush({
            userId: data.userId,
            title: data.title,
            body: data.content,
          });
          break;
        default:
          logger.warn({ data }, '[worker:notification] unknown channel');
      }
    },
    { connection: bullConnection, concurrency: 10 }
  );
  notificationWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[worker:notification] failed');
  });
  notificationWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, '[worker:notification] sent');
  });

  // 异常扫描 worker（每 60s 重复任务，由 ensureRepeatableJobs 入队）
  const anomalyWorker = new Worker(
    'anomaly',
    async () => {
      await runAnomalyScan();
      return { ok: true };
    },
    { connection: bullConnection, concurrency: 1 }
  );
  anomalyWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[worker:anomaly] failed');
  });

  // 备份 worker（每日凌晨）
  const backupWorker = new Worker(
    'backup',
    async () => {
      const r = await runDailyBackup();
      return r;
    },
    { connection: bullConnection, concurrency: 1 }
  );
  backupWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, '[worker:backup] failed');
  });
  backupWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, '[worker:backup] done');
  });

  logger.info('[workers] started: settlement, notification, anomaly, backup');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
