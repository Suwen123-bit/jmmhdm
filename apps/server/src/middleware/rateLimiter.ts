import type { MiddlewareHandler } from 'hono';
import { redis } from '../redis.js';

interface RateLimitOptions {
  windowSec: number;
  max: number;
  keyPrefix?: string;
  keyGenerator?: (c: any) => string;
}

/**
 * Redis 滑动窗口限流
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { windowSec, max, keyPrefix = 'rl', keyGenerator } = options;
  return async (c, next) => {
    const key =
      keyGenerator?.(c) ??
      `${keyPrefix}:${c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'}:${c.req.path}`;

    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, windowSec + 1);
    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > max) {
      return c.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } },
        429
      );
    }
    await next();
  };
}
