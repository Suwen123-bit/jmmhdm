import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { systemConfig } from '../db/schema.js';
import { redis, publisher, subscriber, CHANNELS } from '../redis.js';
import { CONFIG_KEYS, FEATURE_KEYS, DEFAULT_CONFIG } from '@app/shared';
import { logger } from '../logger.js';

const CACHE_PREFIX = 'config:';
const CACHE_TTL = 300; // 5 分钟

/** 写入系统配置并广播失效 */
export async function setConfig(
  key: string,
  value: unknown,
  updatedBy?: number
): Promise<void> {
  await db
    .insert(systemConfig)
    .values({ key, value: value as any, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: value as any, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
  await redis.del(`${CACHE_PREFIX}${key}`);
  await publisher.publish(CHANNELS.CONFIG_UPDATED, key);
  logger.info({ key, value }, '[config] updated');
}

/** 读取配置 (带 Redis 缓存) */
export async function getConfig<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
  const cached = await redis.get(`${CACHE_PREFIX}${key}`);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // ignore
    }
  }
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  const value = rows[0]?.value as T | undefined;
  if (value !== undefined) {
    await redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL, JSON.stringify(value));
    return value;
  }
  return defaultValue;
}

/** 批量读取配置 */
export async function getConfigBatch(keys: string[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const missing: string[] = [];

  // 先尝试 Redis
  const cacheKeys = keys.map((k) => `${CACHE_PREFIX}${k}`);
  const cached = await redis.mget(cacheKeys);
  keys.forEach((k, i) => {
    const v = cached[i];
    if (v !== null && v !== undefined) {
      try {
        result[k] = JSON.parse(v);
      } catch {
        missing.push(k);
      }
    } else {
      missing.push(k);
    }
  });

  if (missing.length > 0) {
    const rows = await db.select().from(systemConfig).where(inArray(systemConfig.key, missing));
    const pipeline = redis.pipeline();
    for (const r of rows) {
      result[r.key] = r.value;
      pipeline.setex(`${CACHE_PREFIX}${r.key}`, CACHE_TTL, JSON.stringify(r.value));
    }
    await pipeline.exec();
  }
  return result;
}

/** 失效缓存 (响应 pubsub) */
async function invalidateCache(key: string): Promise<void> {
  await redis.del(`${CACHE_PREFIX}${key}`);
}

/** 启动 pubsub 订阅 */
export async function initFeatureService(): Promise<void> {
  await subscriber.subscribe(CHANNELS.CONFIG_UPDATED);
  subscriber.on('message', (channel, message) => {
    if (channel === CHANNELS.CONFIG_UPDATED) {
      void invalidateCache(message);
      logger.debug({ key: message }, '[config] cache invalidated');
    }
  });
}

/** 获取所有功能开关 */
export async function getAllFeatureFlags(): Promise<Record<string, boolean>> {
  const keys = FEATURE_KEYS.map((k) => `feature.${k}.enabled`);
  const raw = await getConfigBatch(keys);
  const flags: Record<string, boolean> = {};
  for (const k of FEATURE_KEYS) {
    const fullKey = `feature.${k}.enabled`;
    flags[k] = raw[fullKey] === true || raw[fullKey] === 'true';
  }
  return flags;
}

/** 检查单个功能是否启用 */
export async function isFeatureEnabled(feature: string): Promise<boolean> {
  const flags = await getAllFeatureFlags();
  return !!flags[feature];
}

/** 默认配置初始化 (首次启动用) */
export async function ensureDefaultConfigs(): Promise<void> {
  const defaults: Array<[string, unknown, string]> = [
    [CONFIG_KEYS.FEATURE_TRADE_ENABLED, true, '合约交易功能开关'],
    [CONFIG_KEYS.FEATURE_BLINDBOX_ENABLED, true, '盲盒功能开关'],
    [CONFIG_KEYS.FEATURE_AGENT_ENABLED, true, '代理分销功能开关'],
    [CONFIG_KEYS.FEATURE_AI_ASSISTANT_ENABLED, false, 'AI 助手功能开关'],
    [CONFIG_KEYS.FEATURE_KYC_ENABLED, false, 'KYC 验证功能开关'],
    [CONFIG_KEYS.FEATURE_PASSKEY_ENABLED, false, 'Passkey 无密码登录'],
    [CONFIG_KEYS.TRADE_MIN_AMOUNT, DEFAULT_CONFIG.TRADE_MIN_AMOUNT, '单笔最低投注金额 (USDT)'],
    [CONFIG_KEYS.TRADE_MAX_AMOUNT, DEFAULT_CONFIG.TRADE_MAX_AMOUNT, '单笔最高投注金额 (USDT)'],
    [
      CONFIG_KEYS.TRADE_DEFAULT_PAYOUT_RATE,
      DEFAULT_CONFIG.TRADE_DEFAULT_PAYOUT_RATE,
      '默认收益率',
    ],
    [CONFIG_KEYS.WITHDRAW_MIN_AMOUNT, DEFAULT_CONFIG.WITHDRAW_MIN_AMOUNT, '最低提现金额'],
    [CONFIG_KEYS.WITHDRAW_DAILY_LIMIT, DEFAULT_CONFIG.WITHDRAW_DAILY_LIMIT, '每日提现限额'],
    [
      CONFIG_KEYS.WITHDRAW_AUTO_APPROVE_THRESHOLD,
      DEFAULT_CONFIG.WITHDRAW_AUTO_APPROVE_THRESHOLD,
      '自动审核额度阈值',
    ],
    [CONFIG_KEYS.SITE_NAME, '加密期权 & 盲盒平台', '站点名称'],
    [CONFIG_KEYS.SITE_LOGO, '/logo.svg', '站点 Logo'],
    [CONFIG_KEYS.SITE_MAINTENANCE_MODE, false, '维护模式'],
    [CONFIG_KEYS.AGENT_L1_RATE, DEFAULT_CONFIG.AGENT_L1_RATE, '一级代理佣金率'],
    [CONFIG_KEYS.AGENT_L2_RATE, DEFAULT_CONFIG.AGENT_L2_RATE, '二级代理佣金率'],
    [CONFIG_KEYS.AGENT_L3_RATE, DEFAULT_CONFIG.AGENT_L3_RATE, '三级代理佣金率'],
    [CONFIG_KEYS.NOTIFY_EMAIL_ENABLED, false, '邮件通知开关'],
    [CONFIG_KEYS.NOTIFY_TELEGRAM_ENABLED, false, 'Telegram 通知开关'],
  ];

  for (const [key, value, description] of defaults) {
    const existing = await db
      .select({ key: systemConfig.key })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(systemConfig).values({ key, value: value as any, description });
    }
  }
}
