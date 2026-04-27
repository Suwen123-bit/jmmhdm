import type { Context } from 'hono';
import { captureException } from '../sentry.js';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return c.json(
      { ok: false, error: { code: err.code, message: err.message, details: err.details } },
      err.status as 400 | 401 | 403 | 404 | 409 | 500
    );
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '参数验证失败',
          details: err.flatten().fieldErrors,
        },
      },
      400
    );
  }
  logger.error({ err: err.message, stack: err.stack, path: c.req.path }, '[server error]');
  // 仅上报 5xx 级未知异常到 Sentry，AppError/ZodError 属于业务可控错误不上报
  captureException(err, {
    path: c.req.path,
    method: c.req.method,
  });
  const isProd = process.env.NODE_ENV === 'production';
  return c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: '服务异常，请稍后再试',
        ...(isProd ? {} : { detail: err.message, stack: err.stack?.split('\n').slice(0, 5) }),
      },
    },
    500
  );
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}
