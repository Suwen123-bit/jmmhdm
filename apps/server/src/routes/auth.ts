import { Hono } from 'hono';
import { eq, or, and, ne, isNull } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { zValidator } from '@hono/zod-validator';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  setFundPasswordSchema,
} from '@app/shared';
import { db } from '../db/client.js';
import { users, userSessions, loginLogs } from '../db/schema.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sha256Hex, randomInviteCode } from '../utils/crypto.js';
import { AppError, handleError, ok } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';
import { verifyTotp, isTotpEnabled } from '../services/otpService.js';
import { recordDeviceFingerprint } from '../middleware/antifraud.js';
import { getDeviceFingerprint } from '../utils/request.js';
import { logger } from '../logger.js';

const auth = new Hono();

function getClientIp(c: any): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

// 注册
auth.post(
  '/register',
  rateLimit({ windowSec: 60, max: 5, keyPrefix: 'rl:register' }),
  zValidator('json', registerSchema),
  async (c) => {
    try {
      const { username, email, password, inviteCode } = c.req.valid('json');
      // 用户名/邮箱重复检查
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.username, username), eq(users.email, email)))
        .limit(1);
      if (existing[0]) throw new AppError('USER_EXISTS', '用户名或邮箱已注册', 409);

      // 邀请码 → parentId
      let parentId: number | null = null;
      if (inviteCode) {
        const p = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.inviteCode, inviteCode))
          .limit(1);
        if (p[0]) parentId = p[0].id;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      let myInviteCode = randomInviteCode(8);
      // 极小概率重复，简单兜底
      for (let i = 0; i < 5; i++) {
        const r = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.inviteCode, myInviteCode))
          .limit(1);
        if (!r[0]) break;
        myInviteCode = randomInviteCode(8);
      }

      const inserted = await db
        .insert(users)
        .values({
          username,
          email,
          passwordHash,
          inviteCode: myInviteCode,
          parentId,
          role: 'user',
          status: 'active',
        })
        .returning();
      const user = inserted[0]!;

      const tokens = await issueTokens(user.id, user.role, user.username, c);
      return c.json(ok({ user: sanitizeUser(user), ...tokens }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// 登录
auth.post(
  '/login',
  rateLimit({ windowSec: 60, max: 10, keyPrefix: 'rl:login' }),
  zValidator('json', loginSchema),
  async (c) => {
    try {
      const { account, password, totpCode } = c.req.valid('json');
      const u = await db
        .select()
        .from(users)
        .where(or(eq(users.username, account), eq(users.email, account)))
        .limit(1);
      if (!u[0]) {
        await db.insert(loginLogs).values({
          account,
          ip: getClientIp(c),
          success: false,
          errorMessage: '用户不存在',
        });
        throw new AppError('INVALID_CREDENTIALS', '账号或密码错误', 401);
      }
      const ok1 = await bcrypt.compare(password, u[0].passwordHash);
      if (!ok1) {
        await db.insert(loginLogs).values({
          userId: u[0].id,
          account,
          ip: getClientIp(c),
          success: false,
          errorMessage: '密码错误',
        });
        throw new AppError('INVALID_CREDENTIALS', '账号或密码错误', 401);
      }
      if (u[0].status !== 'active') {
        throw new AppError('ACCOUNT_DISABLED', '账户已停用', 403);
      }

      // TOTP
      if (await isTotpEnabled(u[0].id)) {
        if (!totpCode) {
          return c.json(
            { ok: false, error: { code: 'TOTP_REQUIRED', message: '请输入二步验证码' } },
            200
          );
        }
        await verifyTotp(u[0].id, totpCode, true);
      }

      await db
        .update(users)
        .set({ lastLoginAt: new Date(), lastLoginIp: getClientIp(c) })
        .where(eq(users.id, u[0].id));
      await db.insert(loginLogs).values({
        userId: u[0].id,
        account,
        ip: getClientIp(c),
        device: c.req.header('user-agent') ?? null,
        success: true,
      });

      // 设备指纹采集（异步，不阻塞）
      const fp = getDeviceFingerprint(c);
      if (fp) {
        void recordDeviceFingerprint(u[0].id, fp, {
          ua: c.req.header('user-agent') ?? null,
          ip: getClientIp(c),
        });
      }

      const tokens = await issueTokens(u[0].id, u[0].role, u[0].username, c);
      return c.json(ok({ user: sanitizeUser(u[0]), ...tokens }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// 刷新 token
auth.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  try {
    const { refreshToken } = c.req.valid('json');
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = sha256Hex(refreshToken);
    const session = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.refreshTokenHash, tokenHash))
      .limit(1);
    if (!session[0] || session[0].revokedAt) {
      throw new AppError('SESSION_INVALID', '会话已失效，请重新登录', 401);
    }
    if (session[0].expiresAt < new Date()) {
      throw new AppError('SESSION_EXPIRED', '会话已过期，请重新登录', 401);
    }
    // 撤销旧 session，签发新的
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.id, session[0].id));

    const u = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);

    const tokens = await issueTokens(u[0].id, u[0].role, u[0].username, c);
    return c.json(ok({ user: sanitizeUser(u[0]), ...tokens }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 退出 — 仅撤销当前 session（不影响其他设备）
auth.post('/logout', requireAuth, async (c) => {
  try {
    const { sid } = c.get('auth');
    if (sid) {
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(userSessions.id, sid), isNull(userSessions.revokedAt)));
    }
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 退出所有设备
auth.post('/logout-all', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 修改密码
auth.post(
  '/change-password',
  requireAuth,
  zValidator('json', changePasswordSchema),
  async (c) => {
    try {
      const { userId, sid } = c.get('auth');
      const { oldPassword, newPassword } = c.req.valid('json');
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
      const ok1 = await bcrypt.compare(oldPassword, u[0].passwordHash);
      if (!ok1) throw new AppError('INVALID_PASSWORD', '原密码错误', 400);
      const hash = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, userId));
      // 改密后：撤销其他设备会话，保留当前设备
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(userSessions.userId, userId),
            isNull(userSessions.revokedAt),
            sid ? ne(userSessions.id, sid) : eq(userSessions.id, userSessions.id)
          )
        );
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// 设置资金密码
auth.post(
  '/set-fund-password',
  requireAuth,
  zValidator('json', setFundPasswordSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { fundPassword, loginPassword } = c.req.valid('json');
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
      const ok1 = await bcrypt.compare(loginPassword, u[0].passwordHash);
      if (!ok1) throw new AppError('INVALID_PASSWORD', '登录密码错误', 400);
      const hash = await bcrypt.hash(fundPassword, 10);
      await db.update(users).set({ fundPasswordHash: hash, updatedAt: new Date() }).where(eq(users.id, userId));
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

export default auth;

// ============== helpers ==============
async function issueTokens(userId: number, role: string, username: string, c: any) {
  // 先插入 session 占位行获取 sid，然后签发 token 并回填 hash
  const ip = getClientIp(c);
  const device = c.req.header('user-agent') ?? null;
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);
  const tokenHashPlaceholder = sha256Hex(`init-${userId}-${Date.now()}-${Math.random()}`);
  const inserted = await db
    .insert(userSessions)
    .values({
      userId,
      refreshTokenHash: tokenHashPlaceholder,
      deviceInfo: device,
      ip,
      expiresAt,
    })
    .returning({ id: userSessions.id });
  const sid = inserted[0]!.id;
  const accessToken = signAccessToken({ sub: userId, sid, role, username });
  const refreshToken = signRefreshToken({ sub: userId, sid, jti: `${sid}-${Date.now()}` });
  await db
    .update(userSessions)
    .set({ refreshTokenHash: sha256Hex(refreshToken) })
    .where(eq(userSessions.id, sid));
  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

function sanitizeUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    avatar: u.avatar,
    balance: u.balance,
    frozenBalance: u.frozenBalance,
    inviteCode: u.inviteCode,
    parentId: u.parentId,
    role: u.role,
    status: u.status,
    language: u.language,
    kycLevel: u.kycLevel,
    kycStatus: u.kycStatus,
    createdAt: u.createdAt,
  };
}
