import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tradeRiskConfig } from '../db/schema.js';
import { redis, publisher, subscriber, CHANNELS } from '../redis.js';
import { logger } from '../logger.js';

export interface RiskConfig {
  symbol: string;
  duration: number;
  payoutRate: number;
  priceOffsetBps: number;
  trendBias: number;
  delayMs: number;
  maxSingleBet: number;
  maxTotalExposure: number;
  enabled: boolean;
}

const CACHE_KEY = (symbol: string, duration: number) => `risk:${symbol}:${duration}`;
const CACHE_TTL = 300;

export async function getRiskConfig(
  symbol: string,
  duration: number
): Promise<RiskConfig | null> {
  const cached = await redis.get(CACHE_KEY(symbol, duration));
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
  const rows = await db
    .select()
    .from(tradeRiskConfig)
    .where(and(eq(tradeRiskConfig.symbol, symbol), eq(tradeRiskConfig.duration, duration)))
    .limit(1);
  if (!rows[0]) return null;
  const c: RiskConfig = {
    symbol: rows[0].symbol,
    duration: rows[0].duration,
    payoutRate: Number(rows[0].payoutRate),
    priceOffsetBps: rows[0].priceOffsetBps,
    trendBias: Number(rows[0].trendBias),
    delayMs: rows[0].delayMs,
    maxSingleBet: Number(rows[0].maxSingleBet),
    maxTotalExposure: Number(rows[0].maxTotalExposure),
    enabled: rows[0].enabled,
  };
  await redis.setex(CACHE_KEY(symbol, duration), CACHE_TTL, JSON.stringify(c));
  return c;
}

export async function setRiskConfig(cfg: RiskConfig, updatedBy?: number): Promise<void> {
  await db
    .insert(tradeRiskConfig)
    .values({
      symbol: cfg.symbol,
      duration: cfg.duration,
      payoutRate: cfg.payoutRate.toFixed(4),
      priceOffsetBps: cfg.priceOffsetBps,
      trendBias: cfg.trendBias.toFixed(3),
      delayMs: cfg.delayMs,
      maxSingleBet: cfg.maxSingleBet.toFixed(6),
      maxTotalExposure: cfg.maxTotalExposure.toFixed(6),
      enabled: cfg.enabled,
    })
    .onConflictDoUpdate({
      target: [tradeRiskConfig.symbol, tradeRiskConfig.duration],
      set: {
        payoutRate: cfg.payoutRate.toFixed(4),
        priceOffsetBps: cfg.priceOffsetBps,
        trendBias: cfg.trendBias.toFixed(3),
        delayMs: cfg.delayMs,
        maxSingleBet: cfg.maxSingleBet.toFixed(6),
        maxTotalExposure: cfg.maxTotalExposure.toFixed(6),
        enabled: cfg.enabled,
        updatedAt: new Date(),
      },
    });
  await redis.del(CACHE_KEY(cfg.symbol, cfg.duration));
  await publisher.publish(CHANNELS.CONFIG_UPDATED, `risk.${cfg.symbol}.${cfg.duration}`);
  logger.info({ cfg, updatedBy }, '[risk-config] updated');
}

export async function listRiskConfigs(): Promise<RiskConfig[]> {
  const rows = await db.select().from(tradeRiskConfig);
  return rows.map((r) => ({
    symbol: r.symbol,
    duration: r.duration,
    payoutRate: Number(r.payoutRate),
    priceOffsetBps: r.priceOffsetBps,
    trendBias: Number(r.trendBias),
    delayMs: r.delayMs,
    maxSingleBet: Number(r.maxSingleBet),
    maxTotalExposure: Number(r.maxTotalExposure),
    enabled: r.enabled,
  }));
}

/** 监听 risk-config 失效广播 */
export function initRiskConfigService(): void {
  subscriber.on('message', (channel, message) => {
    if (channel === CHANNELS.CONFIG_UPDATED && message.startsWith('risk.')) {
      // 触发缓存失效（下次读取时会重新拉数据库）
      const parts = message.split('.');
      if (parts.length >= 3) {
        void redis.del(CACHE_KEY(parts[1]!, Number(parts[2]!)));
      }
    }
  });
}
