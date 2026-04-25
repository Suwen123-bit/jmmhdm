import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env.js';
import { logger } from './logger.js';

import authRoute from './routes/auth.js';
import userRoute from './routes/user.js';
import configRoute from './routes/config.js';
import tradeRoute from './routes/trade.js';
import blindboxRoute from './routes/blindbox.js';
import walletRoute from './routes/wallet.js';
import agentRoute from './routes/agent.js';
import ticketRoute from './routes/ticket.js';
import nowpayRoute from './routes/nowpayWebhook.js';
import adminRoute from './routes/admin.js';
import kycRoute from './routes/kyc.js';
import passkeyRoute from './routes/passkey.js';
import aiRoute from './routes/ai.js';
import agreementRoute from './routes/agreement.js';
import uploadRoute from './routes/upload.js';
import internalRoute from './routes/internal.js';
import telegramRoute from './routes/telegram.js';
import { antifraudGuard } from './middleware/antifraud.js';
import { csrfGuard, csrfTokenHandler } from './middleware/csrf.js';
import { sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { redis } from './redis.js';

import { initFeatureService, ensureDefaultConfigs } from './services/featureService.js';
import { initRiskConfigService } from './services/riskConfigService.js';
import { htxPriceEngine } from './services/htxPriceEngine.js';
import { recoverPendingTrades } from './services/tradeEngine.js';
import { startWorkers } from './jobs/workers.js';
import { ensureRepeatableJobs } from './jobs/queues.js';
import { initWsServer } from './ws/server.js';
import {
  registry as metricsRegistry,
  httpRequestsTotal,
  httpRequestDurationMs,
  htxConnectionUp,
} from './metrics.js';

const app = new Hono();

app.use('*', honoLogger());

// Prometheus 指标采集中间件 — 排除 /metrics 自身
app.use('*', async (c, next) => {
  if (c.req.path === '/metrics') return next();
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  // 路径模板化（避免高基数）：取首两段
  const segs = c.req.path.split('/').filter(Boolean).slice(0, 3);
  const tpl = '/' + segs.join('/');
  httpRequestsTotal.inc({ method: c.req.method, path: tpl, status: String(c.res.status) });
  httpRequestDurationMs.observe({ method: c.req.method, path: tpl }, ms);
});

// /metrics 端点
app.get('/metrics', async (c) => {
  htxConnectionUp.set(htxPriceEngine.isConnected() ? 1 : 0);
  const text = await metricsRegistry.metrics();
  c.header('Content-Type', metricsRegistry.contentType);
  return c.body(text);
});

// 安全 Header：CSP / HSTS / X-Frame / Referrer / Permissions
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // 允许 Vite dev 与生产打包的内联脚本（带 nonce 更佳，但前端为 SPA 静态资源故放宽）
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      // WSS、HTX、NOWPayments、OpenAI、IPQS、Sentry
      connectSrc: [
        "'self'",
        'wss:',
        'https://api.huobi.pro',
        'https://api.nowpayments.io',
        'https://api.openai.com',
        'https://www.ipqualityscore.com',
        'https://*.sentry.io',
        'https://api.fpjs.io',
      ],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: ['self'],
      microphone: [],
      geolocation: [],
      payment: [],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
  })
);

app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Device-Fingerprint'],
    exposeHeaders: ['Content-Length'],
  })
);

// CSRF 守卫（仅对 cookie 鉴权请求强制；Bearer token 直接放行）
app.use('/api/*', csrfGuard);
app.get('/api/auth/csrf', csrfTokenHandler);

// 健康检查 — 浅层（用于 LB 探活，永远 200）
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'crypto-platform-api',
    htx: htxPriceEngine.isConnected(),
    ts: Date.now(),
  })
);

// 健康检查 — 深度（PG / Redis / HTX 全部 OK 才返回 200）
app.get('/health/ready', async (c) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  // PG
  const t1 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.postgres = { ok: true, latencyMs: Date.now() - t1 };
  } catch (e: any) {
    checks.postgres = { ok: false, error: e?.message ?? 'pg error' };
  }
  // Redis
  const t2 = Date.now();
  try {
    const pong = await redis.ping();
    checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - t2 };
  } catch (e: any) {
    checks.redis = { ok: false, error: e?.message ?? 'redis error' };
  }
  // HTX
  checks.htx = { ok: htxPriceEngine.isConnected() };

  const allOk = Object.values(checks).every((c) => c.ok);
  return c.json({ ok: allOk, checks, ts: Date.now() }, allOk ? 200 : 503);
});

// API 路由
const api = new Hono();
// 反欺诈守卫：除 webhook（无人机器请求）外，对所有 API 强制执行 IP/地域封禁
api.use('/auth/*', antifraudGuard);
api.use('/user/*', antifraudGuard);
api.use('/trade/*', antifraudGuard);
api.use('/blindbox/*', antifraudGuard);
api.use('/wallet/*', antifraudGuard);
api.use('/agent/*', antifraudGuard);
api.use('/ticket/*', antifraudGuard);
api.use('/kyc/*', antifraudGuard);
api.use('/passkey/*', antifraudGuard);
api.use('/upload/*', antifraudGuard);
api.use('/admin/*', antifraudGuard);

api.route('/auth', authRoute);
api.route('/user', userRoute);
api.route('/config', configRoute);
api.route('/trade', tradeRoute);
api.route('/blindbox', blindboxRoute);
api.route('/wallet', walletRoute);
api.route('/agent', agentRoute);
api.route('/ticket', ticketRoute);
api.route('/nowpay', nowpayRoute);
api.route('/admin', adminRoute);
api.route('/kyc', kycRoute);
api.route('/passkey', passkeyRoute);
api.route('/ai', aiRoute);
api.route('/agreement', agreementRoute);
api.route('/upload', uploadRoute);
api.route('/internal', internalRoute);
api.route('/telegram', telegramRoute);
app.route('/api', api);

// 404
app.notFound((c) => c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'API 不存在' } }, 404));

async function bootstrap() {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, '[boot] starting...');
  // 0. OpenTelemetry（最早启动以追踪所有后续操作）
  const { startOtel } = await import('./otel.js');
  await startOtel();
  // 0.5 Sentry（必须在最早初始化以捕获后续异常）
  const { initSentry } = await import('./sentry.js');
  await initSentry();
  // 1. 默认配置
  await ensureDefaultConfigs();
  // 2. 订阅配置失效广播
  await initFeatureService();
  initRiskConfigService();

  // 3. HTX 行情接入
  htxPriceEngine.start();

  // 4. BullMQ workers + 重复任务调度
  startWorkers();
  await ensureRepeatableJobs().catch((e) =>
    logger.warn({ err: e?.message }, '[boot] ensureRepeatableJobs failed (non-fatal)')
  );

  // 5. 进程恢复未结算订单
  await recoverPendingTrades();

  // 6. HTTP + WS
  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: '0.0.0.0',
    },
    (info) => {
      logger.info(`[boot] HTTP listening on http://0.0.0.0:${info.port}`);
    }
  );
  initWsServer(server as any);

  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[boot] shutting down...');
    htxPriceEngine.stop();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((e) => {
  logger.error({ err: e instanceof Error ? e.message : String(e), stack: (e as Error)?.stack }, '[boot] fatal');
  // 启动失败也尝试上报
  void import('./sentry.js').then(({ captureException }) => captureException(e, { phase: 'bootstrap' }));
  process.exit(1);
});

// 全局未捕获异常上报（兜底）
process.on('uncaughtException', async (err) => {
  logger.error({ err: err.message, stack: err.stack }, '[uncaught] exception');
  const { captureException } = await import('./sentry.js');
  captureException(err, { source: 'uncaughtException' });
});
process.on('unhandledRejection', async (reason) => {
  logger.error({ reason }, '[uncaught] unhandledRejection');
  const { captureException } = await import('./sentry.js');
  captureException(reason, { source: 'unhandledRejection' });
});
