import type { MiddlewareHandler } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { verifyAccessToken } from '../utils/jwt.js';
import { db } from '../db/client.js';
import { users, userSessions } from '../db/schema.js';

export interface AuthContext {
  userId: number;
  sid: number;
  role: string;
  username: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/** 必须登录中间件 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: '未登录' } }, 401);
  }
  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    // 校验 session 未撤销（兼容旧 token：缺 sid 时跳过 session 检查）
    if (payload.sid != null) {
      const s = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(and(eq(userSessions.id, payload.sid), isNull(userSessions.revokedAt)))
        .limit(1);
      if (!s[0]) {
        return c.json(
          { ok: false, error: { code: 'SESSION_REVOKED', message: '会话已失效，请重新登录' } },
          401
        );
      }
    }
    // 简单校验用户状态（可以缓存优化）
    const u = await db
      .select({ status: users.status, role: users.role, username: users.username })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!u[0] || u[0].status !== 'active') {
      return c.json(
        { ok: false, error: { code: 'ACCOUNT_DISABLED', message: '账号已停用' } },
        403
      );
    }
    c.set('auth', {
      userId: payload.sub,
      sid: payload.sid,
      role: u[0].role,
      username: u[0].username,
    });
    await next();
  } catch {
    return c.json({ ok: false, error: { code: 'INVALID_TOKEN', message: 'Token 无效或过期' } }, 401);
  }
};

/** 可选认证：有 token 解析，没有则继续 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      c.set('auth', {
        userId: payload.sub,
        sid: payload.sid,
        role: payload.role,
        username: payload.username,
      });
    } catch {
      // 忽略
    }
  }
  await next();
};

/** 角色权限：admin / super_admin */
export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: '未登录' } }, 401);
    }
    if (!roles.includes(auth.role) && auth.role !== 'super_admin') {
      return c.json({ ok: false, error: { code: 'FORBIDDEN', message: '无权限' } }, 403);
    }
    await next();
  };
}

export const requireAdmin = requireRole('admin', 'super_admin');
