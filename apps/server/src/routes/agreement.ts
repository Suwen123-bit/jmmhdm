import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/client.js';
import { userAgreements, systemConfig } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { handleError, ok, AppError } from '../middleware/errorHandler.js';
import { agreementAcceptSchema } from '@app/shared';
import { getConfig } from '../services/featureService.js';
import { getClientIp } from '../utils/request.js';

const agreement = new Hono();

/**
 * 公开：获取当前生效版本（注册页用）
 */
agreement.get('/current', async (c) => {
  try {
    const types = ['terms', 'privacy', 'risk'] as const;
    const out: Record<string, { version: string | null }> = {};
    for (const t of types) {
      const v = await getConfig<string>(`agreement.${t}.current`);
      out[t] = { version: v ?? null };
    }
    return c.json(ok(out));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

/**
 * 公开：获取协议内容
 */
agreement.get('/content', async (c) => {
  try {
    const type = c.req.query('type') ?? '';
    const version = c.req.query('version') ?? '';
    if (!['terms', 'privacy', 'risk'].includes(type) || !version) {
      throw new AppError('INVALID_PARAMS', 'type/version 不合法', 400);
    }
    const row = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, `agreement.${type}.${version}`))
      .limit(1);
    return c.json(ok({ content: (row[0]?.value as string) ?? '' }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 以下需要登录
agreement.use('/list', requireAuth);
agreement.use('/accept', requireAuth);

/**
 * 列出当前用户已接受的协议（前端用于判断是否需要展示弹窗）
 */
agreement.get('/list', async (c) => {
  try {
    const { userId } = c.get('auth');
    const items = await db
      .select()
      .from(userAgreements)
      .where(eq(userAgreements.userId, userId))
      .orderBy(desc(userAgreements.agreedAt));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

/**
 * 接受协议 (terms/privacy/risk + version)
 *  - 同 (userId, agreementType, version) 已接受则忽略
 */
agreement.post('/accept', zValidator('json', agreementAcceptSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const { agreementType, version } = c.req.valid('json');
    const exists = await db
      .select({ id: userAgreements.id })
      .from(userAgreements)
      .where(
        and(
          eq(userAgreements.userId, userId),
          eq(userAgreements.agreementType, agreementType),
          eq(userAgreements.version, version)
        )
      )
      .limit(1);
    if (!exists[0]) {
      await db.insert(userAgreements).values({
        userId,
        agreementType,
        version,
        ip: getClientIp(c),
      });
    }
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default agreement;
