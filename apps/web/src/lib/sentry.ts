import * as Sentry from '@sentry/react';

export async function initSentry(): Promise<void> {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN_WEB;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta as any).env?.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.5,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  });
}

export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}
