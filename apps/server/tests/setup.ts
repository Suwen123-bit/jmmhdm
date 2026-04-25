/**
 * vitest 全局 setup：在任何测试模块导入前注入最小必要 env，
 * 避免 src/config/env.ts 顶层 zod 校验失败导致进程退出。
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://test:test@127.0.0.1:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'b'.repeat(48);
process.env.HTX_WS_URL =
  process.env.HTX_WS_URL ?? 'wss://api.huobi.pro/ws';
process.env.NOWPAY_IPN_SECRET =
  process.env.NOWPAY_IPN_SECRET ?? 'test_ipn_secret_123';
