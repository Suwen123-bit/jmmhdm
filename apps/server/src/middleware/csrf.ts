import type { MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';
import { logger } from '../logger.js';

/**
 * CSRF 双重提交 cookie 校验中间件
 *
 * 适用场景：
 *  - 当前架构主用 Authorization: Bearer，理论上对 CSRF 免疫
 *  - 但若前端将来改用 httpOnly cookie 存 token，或后台管理新增 cookie 鉴权，则需此中间件
 *  - 当前作为强化层启用：所有写操作必须带 X-CSRF-Token，且需与 cookie csrf-token 匹配
 *
 * 例外：webhook（NOWPayments IPN）、登录/注册（首次访问还没拿到 token）、SSE/WS
 *
 * 客户端：
 *  - 首次访问 GET /api/auth/csrf 获取 cookie + body 中的 token
 *  - 后续写请求把 token 附在 X-CSRF-Token 头
 */

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const SKIP_PATHS = [
  '/api/nowpay/ipn',          // 支付 webhook 用 HMAC 验签代替
  '/api/telegram/webhook',    // Telegram webhook 用 secret token 验签代替
  '/api/internal',            // 内部端点（如 alertmanager-webhook），需在网关侧 IP 白名单
  '/api/auth/csrf',           // 颁发 token 自身
  '/api/auth/login',          // 登录前没 token
  '/api/auth/register',       // 注册前没 token
  '/api/auth/refresh',        // refresh token 已含敏感
  '/api/passkey/register/begin',
  '/api/passkey/register/finish',
  '/api/passkey/login/begin',
  '/api/passkey/login/finish',
];

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 在 cookie 中读取 csrf-token
 */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const piece of cookieHeader.split(';')) {
    const [k, v] = piece.trim().split('=');
    if (k === name && v) return decodeURIComponent(v);
  }
  return null;
}

export const csrfGuard: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return next();

  const path = c.req.path;
  if (SKIP_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
    return next();
  }

  // 仅对 cookie 鉴权请求强制 CSRF；Bearer token 鉴权请求不强制
  // 判定逻辑：若请求带 Authorization: Bearer，则视为 stateless API，跳过 CSRF
  const auth = c.req.header('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return next();

  const cookieHeader = c.req.header('cookie');
  const cookieToken = readCookie(cookieHeader, CSRF_COOKIE);
  const headerToken = c.req.header(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    return c.json(
      { ok: false, error: { code: 'CSRF_MISSING', message: 'CSRF token 缺失' } },
      403
    );
  }
  // 用恒定时间比较防止 timing attack
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn({ path }, '[csrf] token mismatch');
    return c.json(
      { ok: false, error: { code: 'CSRF_INVALID', message: 'CSRF token 不匹配' } },
      403
    );
  }
  return next();
};

/**
 * GET /api/auth/csrf：颁发 cookie + body token
 */
export function csrfTokenHandler(c: any) {
  const token = generateCsrfToken();
  // 30 分钟有效；SameSite=Lax 防 CSRF；Secure 仅 HTTPS
  const cookieParts = [
    `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'Max-Age=1800',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
  c.header('Set-Cookie', cookieParts.join('; '));
  return c.json({ ok: true, data: { csrfToken: token } });
}
