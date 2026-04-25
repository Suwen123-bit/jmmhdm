import * as Sentry from '@sentry/react';

export async function initSentry(): Promise<void> {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN_ADMIN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: (import.meta as any).env?.MODE,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
