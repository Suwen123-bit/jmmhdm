import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/client.js';
import {
  users,
  walletLogs,
  loginLogs,
  webPushSubscriptions,
  notificationPreferences,
  userTelegram,
} from '../db/schema.js';
import { and } from 'drizzle-orm';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { ok, handleError, AppError } from '../middleware/errorHandler.js';
import { updateProfileSchema } from '@app/shared';
import {
  generateTotpSecret,
  enableTotp,
  disableTotp,
  isTotpEnabled,
} from '../services/otpService.js';
import {
  listUserNotifications,
  markAllRead,
} from '../services/notificationService.js';
import { z } from 'zod';

const user = new Hono();
user.use('*', requireAuth);

// 当前用户信息
user.get('/me', async (c) => {
  try {
    const { userId } = c.get('auth');
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
    const totpEnabled = await isTotpEnabled(userId);
    return c.json(
      ok({
        id: u[0].id,
        username: u[0].username,
        email: u[0].email,
        avatar: u[0].avatar,
        balance: u[0].balance,
        frozenBalance: u[0].frozenBalance,
        inviteCode: u[0].inviteCode,
        parentId: u[0].parentId,
        role: u[0].role,
        status: u[0].status,
        language: u[0].language,
        totpEnabled,
        hasFundPassword: !!u[0].fundPasswordHash,
        kycLevel: u[0].kycLevel,
        kycStatus: u[0].kycStatus,
        createdAt: u[0].createdAt,
      })
    );
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 修改个人资料
user.post('/profile', zValidator('json', updateProfileSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = c.req.valid('json');
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.avatar !== undefined) set.avatar = data.avatar;
    if (data.language !== undefined) set.language = data.language;
    await db.update(users).set(set as any).where(eq(users.id, userId));
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 钱包流水
user.get('/wallet/logs', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(walletLogs)
        .where(eq(walletLogs.userId, userId))
        .orderBy(desc(walletLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(walletLogs)
        .where(eq(walletLogs.userId, userId)),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 登录日志
user.get('/login-logs', async (c) => {
  try {
    const { userId } = c.get('auth');
    const items = await db
      .select()
      .from(loginLogs)
      .where(eq(loginLogs.userId, userId))
      .orderBy(desc(loginLogs.createdAt))
      .limit(50);
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 通知
user.get('/notifications', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const data = await listUserNotifications(userId, page, pageSize);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

user.post('/notifications/read-all', async (c) => {
  try {
    const { userId } = c.get('auth');
    await markAllRead(userId);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 通知偏好
user.get('/notifications/preferences', async (c) => {
  try {
    const { userId } = c.get('auth');
    const items = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

const prefSchema = z.object({
  eventType: z.string().min(1).max(32),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  webpush: z.boolean().optional(),
  telegram: z.boolean().optional(),
});
user.post(
  '/notifications/preferences',
  zValidator('json', prefSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const p = c.req.valid('json');
      await db
        .insert(notificationPreferences)
        .values({
          userId,
          eventType: p.eventType,
          inApp: p.inApp ?? true,
          email: p.email ?? true,
          webpush: p.webpush ?? true,
          telegram: p.telegram ?? false,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.eventType,
          ],
          set: {
            inApp: p.inApp ?? undefined,
            email: p.email ?? undefined,
            webpush: p.webpush ?? undefined,
            telegram: p.telegram ?? undefined,
          },
        });
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// WebPush 订阅
user.get('/notifications/vapid-public-key', async (c) =>
  c.json(ok({ key: env.VAPID_PUBLIC_KEY ?? null }))
);

const webpushSubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
});
user.post('/notifications/webpush/subscribe', zValidator('json', webpushSubSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const { endpoint, keys } = c.req.valid('json');
    await db
      .insert(webPushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        authKey: keys.auth,
        userAgent: c.req.header('user-agent') ?? null,
      })
      .onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: { userId, p256dh: keys.p256dh, authKey: keys.auth },
      });
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

user.post(
  '/notifications/webpush/unsubscribe',
  zValidator('json', z.object({ endpoint: z.string().url() })),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { endpoint } = c.req.valid('json');
      await db
        .delete(webPushSubscriptions)
        .where(
          and(
            eq(webPushSubscriptions.userId, userId),
            eq(webPushSubscriptions.endpoint, endpoint)
          )
        );
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// Telegram 绑定（初版：用户提供 chatId，后续可改为通过 deep-link / verify code 验证）
const telegramLinkSchema = z.object({
  telegramChatId: z.string().min(1).max(64),
});
user.post(
  '/notifications/telegram/link',
  zValidator('json', telegramLinkSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { telegramChatId } = c.req.valid('json');
      await db
        .insert(userTelegram)
        .values({ userId, telegramChatId, verified: false })
        .onConflictDoUpdate({
          target: userTelegram.userId,
          set: { telegramChatId, verified: false },
        });
      return c.json(ok({ success: true, note: '请等待管理员或 bot 验证' }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

user.post('/notifications/telegram/unlink', async (c) => {
  try {
    const { userId } = c.get('auth');
    await db.delete(userTelegram).where(eq(userTelegram.userId, userId));
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// TOTP
user.post('/totp/setup', async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = await generateTotpSecret(userId);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

const totpCodeSchema = z.object({ code: z.string().length(6) });

user.post('/totp/enable', zValidator('json', totpCodeSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const { code } = c.req.valid('json');
    await enableTotp(userId, code);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

user.post('/totp/disable', zValidator('json', totpCodeSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const { code } = c.req.valid('json');
    await disableTotp(userId, code);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default user;
