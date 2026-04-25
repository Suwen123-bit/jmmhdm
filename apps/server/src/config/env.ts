import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  PUBLIC_API_URL: z.string().default('http://localhost:3001'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_ORIGIN: z.string().default('http://localhost:5174'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(604800),

  ENCRYPTION_KEY: z.string().optional(),

  HTX_WS_URL: z.string().default('wss://api.huobi.pro/ws'),
  HTX_REST_URL: z.string().default('https://api.huobi.pro'),

  NOWPAY_API_KEY: z.string().optional(),
  NOWPAY_IPN_SECRET: z.string().optional(),
  NOWPAY_API_URL: z.string().default('https://api.nowpayments.io/v1'),

  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_OPS_CHAT_ID: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  SENTRY_DSN_SERVER: z.string().optional(),

  // WebPush VAPID
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:ops@example.com'),

  // Passkey / WebAuthn
  PASSKEY_RP_ID: z.string().default('localhost'),
  PASSKEY_RP_NAME: z.string().default('Crypto Platform'),
  PASSKEY_ORIGIN: z.string().default('http://localhost:5173'),

  // NOWPayments Payout（独立 API key & JWT credentials）
  NOWPAY_PAYOUT_API_KEY: z.string().optional(),
  NOWPAY_PAYOUT_EMAIL: z.string().optional(),
  NOWPAY_PAYOUT_PASSWORD: z.string().optional(),

  // IPQualityScore（VPN/proxy/risk score）
  IPQS_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ 环境变量校验失败：', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// 生产环境额外硬性校验
if (parsed.data.NODE_ENV === 'production') {
  const required: Array<[string, string | undefined]> = [
    ['ENCRYPTION_KEY', parsed.data.ENCRYPTION_KEY],
    ['NOWPAY_API_KEY', parsed.data.NOWPAY_API_KEY],
    ['NOWPAY_IPN_SECRET', parsed.data.NOWPAY_IPN_SECRET],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error('❌ 生产环境缺少必要环境变量：', missing.join(', '));
    process.exit(1);
  }
  // 弱密钥拒绝
  if (parsed.data.JWT_ACCESS_SECRET.length < 32 || parsed.data.JWT_REFRESH_SECRET.length < 32) {
    // eslint-disable-next-line no-console
    console.error('❌ 生产环境 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 至少需要 32 字节');
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = typeof env;
