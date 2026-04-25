import { redis } from '../redis.js';
import type { PriceTick, Kline } from '@app/shared';

const TICK_KEY = (symbol: string) => `price:tick:${symbol}`;
const KLINE_KEY = (symbol: string, interval: string) => `kline:${symbol}:${interval}`;
const KLINE_TTL = 60 * 60 * 24 * 7; // 7天

/** 写入最新价 */
export async function setLatestTick(tick: PriceTick): Promise<void> {
  await redis.set(TICK_KEY(tick.symbol), JSON.stringify(tick), 'EX', 300);
}

/** 取最新价 */
export async function getLatestTick(symbol: string): Promise<PriceTick | null> {
  const raw = await redis.get(TICK_KEY(symbol));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PriceTick;
  } catch {
    return null;
  }
}

/** 取多个交易对最新价 */
export async function getLatestTicks(symbols: string[]): Promise<Record<string, PriceTick>> {
  if (symbols.length === 0) return {};
  const keys = symbols.map((s) => TICK_KEY(s));
  const values = await redis.mget(keys);
  const out: Record<string, PriceTick> = {};
  for (let i = 0; i < symbols.length; i++) {
    const v = values[i];
    if (v) {
      try {
        out[symbols[i]!] = JSON.parse(v);
      } catch {
        // skip
      }
    }
  }
  return out;
}

/** 写入 K 线 — 使用 zset，score=time */
export async function appendKline(kline: Kline): Promise<void> {
  const key = KLINE_KEY(kline.symbol, kline.interval);
  // 用 time 做 score 实现去重 + 顺序
  await redis
    .multi()
    .zremrangebyscore(key, kline.time, kline.time)
    .zadd(key, kline.time, JSON.stringify(kline))
    .expire(key, KLINE_TTL)
    .exec();
}

/** 取最近 N 条 K 线 */
export async function getKlines(
  symbol: string,
  interval: string,
  limit = 500
): Promise<Kline[]> {
  const key = KLINE_KEY(symbol, interval);
  const items = await redis.zrevrange(key, 0, limit - 1);
  const out: Kline[] = [];
  for (const it of items) {
    try {
      out.push(JSON.parse(it));
    } catch {
      // skip
    }
  }
  return out.reverse();
}
