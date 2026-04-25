import { spawn } from 'node:child_process';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { notifyOps } from './notificationDispatch.js';

/**
 * 数据库备份服务
 *
 * 设计：
 *  - 使用 pg_dump --format=custom 输出二进制压缩归档
 *  - 上传到 S3 兼容存储 backups/yyyy/MM/dd/db_<ts>.dump
 *  - 失败 → ops 告警；成功 → 日志
 *
 * 前置：容器内必须有 pg_dump 可执行（生产构建时已包含 postgresql-client）
 */
export async function runDailyBackup(): Promise<{ uploaded: boolean; key?: string; size?: number; reason?: string }> {
  if (!env.STORAGE_ENDPOINT || !env.STORAGE_BUCKET) {
    logger.warn('[backup] storage not configured, skipping');
    return { uploaded: false, reason: 'storage_not_configured' };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(tmpdir(), 'crypto-backup');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `db_${ts}.dump`);

  // 用 DATABASE_URL 直接传 pg_dump
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--file', file, env.DATABASE_URL],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`))));
    child.on('error', reject);
  }).catch((e) => {
    logger.error({ err: e?.message }, '[backup] pg_dump failed');
    void notifyOps({
      title: '[Backup] pg_dump 失败',
      content: e?.message ?? 'unknown',
      level: 'critical',
    });
    throw e;
  });

  const stat = statSync(file);
  const size = stat.size;

  const yyyy = new Date().getUTCFullYear();
  const MM = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  const dd = String(new Date().getUTCDate()).padStart(2, '0');
  const key = `backups/${yyyy}/${MM}/${dd}/db_${ts}.dump`;

  const client = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: env.STORAGE_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      Body: createReadStream(file),
      ContentType: 'application/octet-stream',
      ACL: 'private',
    })
  );

  await unlink(file).catch(() => undefined);

  logger.info({ key, size }, '[backup] uploaded');
  void notifyOps({
    title: '[Backup] 数据库备份成功',
    content: `key=${key} size=${(size / 1024 / 1024).toFixed(2)}MB`,
    level: 'info',
  });
  return { uploaded: true, key, size };
}
