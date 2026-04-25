import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

/**
 * 对象存储服务（兼容 AWS S3 / Cloudflare R2 / MinIO）
 *
 * 设计：
 *  - 后端签发预签名 PUT URL → 客户端直传对象存储 → 客户端把返回的 URL 提交给业务接口
 *  - 后端不参与文件流，避免占用服务器带宽
 *  - 路径策略：`<scope>/<userId>/<yyyymm>/<sha1(rand+ts)>.<ext>` 防猜测、防覆盖
 */

const ALLOWED_MIME_BY_SCOPE: Record<string, string[]> = {
  kyc: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  ticket: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  blindbox: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
};

const MAX_SIZE_BY_SCOPE: Record<string, number> = {
  kyc: 10 * 1024 * 1024, // 10MB
  avatar: 2 * 1024 * 1024, // 2MB
  ticket: 10 * 1024 * 1024, // 10MB
  blindbox: 5 * 1024 * 1024, // 5MB
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

let _s3: S3Client | null = null;

function getClient(): S3Client {
  if (_s3) return _s3;
  if (!env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY || !env.STORAGE_BUCKET) {
    throw new AppError('STORAGE_NOT_CONFIGURED', '对象存储未配置', 500);
  }
  _s3 = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true, // R2 / MinIO 需要 path style
  });
  return _s3;
}

export interface PresignOptions {
  scope: 'kyc' | 'avatar' | 'ticket' | 'blindbox';
  userId: number;
  contentType: string;
  contentLength?: number;
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * 签发预签名 PUT URL（默认 5 分钟有效）
 */
export async function presignUpload(opts: PresignOptions): Promise<PresignResult> {
  const allowed = ALLOWED_MIME_BY_SCOPE[opts.scope];
  if (!allowed) throw new AppError('INVALID_SCOPE', '非法上传 scope', 400);
  if (!allowed.includes(opts.contentType)) {
    throw new AppError(
      'UNSUPPORTED_MIME',
      `${opts.scope} 不支持的文件类型 ${opts.contentType}`,
      400
    );
  }
  const max = MAX_SIZE_BY_SCOPE[opts.scope] ?? 5 * 1024 * 1024;
  if (opts.contentLength && opts.contentLength > max) {
    throw new AppError('FILE_TOO_LARGE', `文件超过 ${(max / 1024 / 1024).toFixed(1)}MB 限制`, 400);
  }

  const ext = EXT_BY_MIME[opts.contentType] ?? 'bin';
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', ''); // 202601
  const rand = crypto.randomBytes(16).toString('hex');
  const key = `${opts.scope}/${opts.userId}/${yyyymm}/${rand}.${ext}`;

  const cmd = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    // KYC 默认 private；其他 scope 默认 public
    ACL: opts.scope === 'kyc' ? 'private' : 'public-read',
  });
  const expiresIn = 300;
  const uploadUrl = await getSignedUrl(getClient(), cmd, { expiresIn });

  // 公开访问 URL 拼接：优先 STORAGE_PUBLIC_BASE，否则按 endpoint+bucket+key
  const publicUrl = env.STORAGE_PUBLIC_BASE
    ? `${env.STORAGE_PUBLIC_BASE.replace(/\/$/, '')}/${key}`
    : `${env.STORAGE_ENDPOINT!.replace(/\/$/, '')}/${env.STORAGE_BUCKET}/${key}`;

  return { uploadUrl, publicUrl, key, expiresIn };
}

/**
 * 签发临时只读 GET URL（用于 admin 查看 KYC 私有文件）
 */
export async function presignDownload(key: string, ttlSec = 600): Promise<string> {
  const cmd = new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key });
  // HEAD 不能用于 GET URL，但用 PutObject + presign 也能用 GetObject，不过简单起见动态 import GetObjectCommand
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
    { expiresIn: ttlSec }
  );
}

/**
 * 删除对象（用户删除头像 / 撤销 KYC 时）
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key })
    );
  } catch (e: any) {
    logger.warn({ key, err: e?.message }, '[storage] delete failed');
  }
}

/**
 * 校验给定的 publicUrl 是否属于本桶（防止外部 URL 注入）
 */
export function isOwnedUrl(url: string): boolean {
  if (!url) return false;
  if (env.STORAGE_PUBLIC_BASE && url.startsWith(env.STORAGE_PUBLIC_BASE)) return true;
  if (
    env.STORAGE_ENDPOINT &&
    env.STORAGE_BUCKET &&
    url.startsWith(`${env.STORAGE_ENDPOINT.replace(/\/$/, '')}/${env.STORAGE_BUCKET}/`)
  ) {
    return true;
  }
  return false;
}

export function isStorageConfigured(): boolean {
  return !!(env.STORAGE_ENDPOINT && env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY);
}
