import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    pool: 'forks',
    setupFiles: ['./tests/setup.ts'],
    // env 在测试 worker 启动前注入，绕开 src/config/env.ts 顶层 zod 校验
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      JWT_REFRESH_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      HTX_WS_URL: 'wss://api.huobi.pro/ws',
      NOWPAY_IPN_SECRET: 'test_ipn_secret_123',
    },
  },
});
