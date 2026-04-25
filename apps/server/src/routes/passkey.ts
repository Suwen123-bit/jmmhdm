import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../middleware/auth.js';
import { handleError, ok } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import {
  buildRegisterOptions,
  verifyRegister,
  buildLoginOptions,
  verifyLogin,
  listUserPasskeys,
  deletePasskey,
} from '../services/passkeyService.js';

const passkey = new Hono();

// ============== 注册（已登录）==============
passkey.post('/register/options', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = await buildRegisterOptions(userId);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

const verifyRegisterSchema = z.object({
  sessionToken: z.string().min(8),
  response: z.any(),
  deviceName: z.string().max(128).optional(),
});
passkey.post(
  '/register/verify',
  requireAuth,
  zValidator('json', verifyRegisterSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { sessionToken, response, deviceName } = c.req.valid('json');
      const r = await verifyRegister({
        userId,
        sessionToken,
        response,
        deviceName,
      });
      return c.json(ok(r));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

passkey.get('/list', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    const items = await listUserPasskeys(userId);
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

passkey.delete('/:id', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    const id = Number(c.req.param('id'));
    const r = await deletePasskey(userId, id);
    return c.json(ok(r));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 登录（无需鉴权，结果交由 auth 流程接管）==============
const loginOptionsSchema = z.object({
  username: z.string().min(1).max(64).optional(),
});
passkey.post(
  '/login/options',
  rateLimit({ windowSec: 60, max: 30, keyPrefix: 'rl:passkey:login-opts' }),
  zValidator('json', loginOptionsSchema),
  async (c) => {
    try {
      const data = await buildLoginOptions(c.req.valid('json'));
      return c.json(ok(data));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

const verifyLoginSchema = z.object({
  sessionToken: z.string().min(8),
  response: z.any(),
});

/**
 * 此处仅完成 WebAuthn 校验并返回 userId；
 * 真实 token 签发统一在 auth 路由中实现，避免重复，
 * 但为方便前端，直接在此完成 issueTokens 调用。
 */
import { signAccessToken, signRefreshToken } from '../utils/jwt.js';
import { db } from '../db/client.js';
import { userSessions, users, loginLogs } from '../db/schema.js';
import { sha256Hex } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';
import { getClientIp } from '../utils/request.js';

passkey.post(
  '/login/verify',
  rateLimit({ windowSec: 60, max: 20, keyPrefix: 'rl:passkey:login-verify' }),
  zValidator('json', verifyLoginSchema),
  async (c) => {
    try {
      const { sessionToken, response } = c.req.valid('json');
      const { userId } = await verifyLogin({ sessionToken, response });

      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
      if (u[0].status !== 'active') {
        throw new AppError('ACCOUNT_DISABLED', '账户已停用', 403);
      }

      // 创建 session 行
      const ip = getClientIp(c);
      const device = c.req.header('user-agent') ?? null;
      const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);
      const ph = sha256Hex(`init-${userId}-${Date.now()}-${Math.random()}`);
      const inserted = await db
        .insert(userSessions)
        .values({
          userId,
          refreshTokenHash: ph,
          deviceInfo: device,
          ip,
          expiresAt,
        })
        .returning({ id: userSessions.id });
      const sid = inserted[0]!.id;
      const accessToken = signAccessToken({
        sub: userId,
        sid,
        role: u[0].role,
        username: u[0].username,
      });
      const refreshToken = signRefreshToken({
        sub: userId,
        sid,
        jti: `${sid}-${Date.now()}`,
      });
      await db
        .update(userSessions)
        .set({ refreshTokenHash: sha256Hex(refreshToken) })
        .where(eq(userSessions.id, sid));

      await db.insert(loginLogs).values({
        userId,
        account: u[0].username,
        ip,
        device,
        success: true,
        errorMessage: 'passkey',
      });
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), lastLoginIp: ip })
        .where(eq(users.id, userId));

      return c.json(
        ok({
          accessToken,
          refreshToken,
          expiresIn: env.JWT_ACCESS_TTL,
          user: {
            id: u[0].id,
            username: u[0].username,
            email: u[0].email,
            avatar: u[0].avatar,
            role: u[0].role,
          },
        })
      );
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

export default passkey;
