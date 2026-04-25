import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { uploadPresignSchema } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { handleError, ok } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { presignUpload, isStorageConfigured } from '../services/storageService.js';

const upload = new Hono();

upload.use('*', requireAuth);

/**
 * 申请预签名上传 URL
 * 客户端流程：
 *  1) POST /api/upload/presign { scope, contentType, contentLength } → { uploadUrl, publicUrl }
 *  2) PUT <uploadUrl>，Headers: { 'Content-Type': contentType }，Body: file
 *  3) 把 publicUrl 提交给业务接口（KYC submit / profile update / ticket）
 */
upload.post(
  '/presign',
  rateLimit({ windowSec: 60, max: 20, keyPrefix: 'rl:upload:presign' }),
  zValidator('json', uploadPresignSchema),
  async (c) => {
    try {
      if (!isStorageConfigured()) {
        return c.json(
          { ok: false, error: { code: 'STORAGE_NOT_CONFIGURED', message: '对象存储未配置' } },
          503
        );
      }
      const { userId } = c.get('auth');
      const input = c.req.valid('json');
      const r = await presignUpload({
        scope: input.scope,
        userId,
        contentType: input.contentType,
        contentLength: input.contentLength,
      });
      return c.json(ok(r));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

export default upload;
