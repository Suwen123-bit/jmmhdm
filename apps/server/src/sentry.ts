/**
 * Sentry 集成（可选）
 *  - 仅在 SENTRY_DSN_SERVER 配置后启用
 *  - 使用动态 import 避免未配置时引入运行时开销
 */
import { env } from './config/env.js';
import { logger } from './logger.js';

let initialized = false;
let SentryRef: typeof import('@sentry/node') | null = null;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (!env.SENTRY_DSN_SERVER) {
    logger.info('[sentry] DSN not set, skipping');
    return;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN_SERVER,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      release: process.env.GIT_COMMIT_SHA ?? undefined,
      // 默认开启自动 instrumentation
    });
    SentryRef = Sentry;
    initialized = true;
    logger.info({ env: env.NODE_ENV }, '[sentry] initialized');
  } catch (e: any) {
    logger.error({ err: e?.message }, '[sentry] init failed');
  }
}

/**
 * 上报异常（任何代码路径都可调用）
 *  - 不阻塞业务流；初始化未完成时静默
 */
export function captureException(err: unknown, ctx?: Record<string, any>): void {
  if (!SentryRef || !initialized) return;
  try {
    SentryRef.captureException(err, ctx ? { extra: ctx } : undefined);
  } catch {
    // ignore
  }
}

export function captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!SentryRef || !initialized) return;
  try {
    SentryRef.captureMessage(msg, level);
  } catch {
    // ignore
  }
}
