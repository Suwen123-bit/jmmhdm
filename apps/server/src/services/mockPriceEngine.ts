import { logger } from '../logger.js';
import { setLatestTick, appendKline } from './priceCache.js';
import { publisher, CHANNELS } from '../redis.js';
import { SUPPORTED_SYMBOLS, WS_EVENTS } from '@app/shared';
import type { PriceTick, Kline } from '@app/shared';

/**
 * 仅用于本地开发的 mock 行情引擎。
 * - 为每个 SUPPORTED_SYMBOLS 生成一个随机游走的最新价
 * - 每秒推送一次 tick
 * - 每个 K 线周期边界产出一根新 K 线
 *
 * 接口与 HtxPriceEngine 对齐：start() / stop() / isConnected()
 */

const BASE_PRICES: Record<string, number> = {
  btcusdt: 67000,
  ethusdt: 3500,
  solusdt: 160,
  bnbusdt: 600,
  dogeusdt: 0.16,
  xrpusdt: 0.55,
  adausdt: 0.45,
  ltcusdt: 90,
};

const INTERVALS: Array<{ name: '1min' | '5min' | '15min' | '30min' | '60min'; sec: number }> = [
  { name: '1min', sec: 60 },
  { name: '5min', sec: 300 },
  { name: '15min', sec: 900 },
  { name: '30min', sec: 1800 },
  { name: '60min', sec: 3600 },
];

interface KlineBucket {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bucketStart: number;
}

class MockPriceEngine {
  private prices: Record<string, number> = {};
  private opens24h: Record<string, number> = {};
  private highs24h: Record<string, number> = {};
  private lows24h: Record<string, number> = {};
  private vols24h: Record<string, number> = {};
  private buckets: Record<string, Record<string, KlineBucket>> = {};
  private tickTimer: NodeJS.Timeout | null = null;
  private connected = false;

  start(): void {
    logger.warn('[mock-market] starting MOCK market data provider (development only)');
    for (const sym of SUPPORTED_SYMBOLS) {
      const base = BASE_PRICES[sym] ?? 100;
      this.prices[sym] = base;
      this.opens24h[sym] = base;
      this.highs24h[sym] = base;
      this.lows24h[sym] = base;
      this.vols24h[sym] = 0;
      this.buckets[sym] = {};
      const now = Math.floor(Date.now() / 1000);
      for (const iv of INTERVALS) {
        const bucketStart = Math.floor(now / iv.sec) * iv.sec;
        this.buckets[sym]![iv.name] = {
          open: base,
          high: base,
          low: base,
          close: base,
          volume: 0,
          bucketStart,
        };
      }
    }
    this.connected = true;
    this.tickTimer = setInterval(() => {
      this.tickAll().catch((e) =>
        logger.error({ err: e?.message }, '[mock-market] tickAll failed')
      );
    }, 1000);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async tickAll(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();
    for (const sym of SUPPORTED_SYMBOLS) {
      const last = this.prices[sym]!;
      // 随机游走：每秒 ±0.05% 噪声
      const delta = (Math.random() - 0.5) * 0.001;
      const next = Math.max(0.000001, last * (1 + delta));
      this.prices[sym] = next;
      this.highs24h[sym] = Math.max(this.highs24h[sym]!, next);
      this.lows24h[sym] = Math.min(this.lows24h[sym]!, next);
      const tradeVol = Math.random() * 0.5;
      this.vols24h[sym] = (this.vols24h[sym] ?? 0) + tradeVol;

      // 写入 tick + 推送
      const tick: PriceTick = {
        symbol: sym,
        price: next,
        volume24h: this.vols24h[sym]!,
        change24h:
          this.opens24h[sym]! > 0 ? (next - this.opens24h[sym]!) / this.opens24h[sym]! : 0,
        high24h: this.highs24h[sym]!,
        low24h: this.lows24h[sym]!,
        ts: nowMs,
      };
      await setLatestTick(tick);
      void publisher.publish(
        CHANNELS.PRICE_TICK,
        JSON.stringify({ event: WS_EVENTS.PRICE_TICK, data: tick })
      );

      // 更新各周期 K 线
      for (const iv of INTERVALS) {
        const bucket = this.buckets[sym]![iv.name]!;
        const newBucketStart = Math.floor(now / iv.sec) * iv.sec;
        if (newBucketStart !== bucket.bucketStart) {
          // 切换到新 bucket：以上一根 close 作为新 bucket 的 open
          bucket.bucketStart = newBucketStart;
          bucket.open = bucket.close;
          bucket.high = next;
          bucket.low = next;
          bucket.close = next;
          bucket.volume = tradeVol;
        } else {
          bucket.high = Math.max(bucket.high, next);
          bucket.low = Math.min(bucket.low, next);
          bucket.close = next;
          bucket.volume += tradeVol;
        }
        const kline: Kline = {
          symbol: sym,
          interval: iv.name,
          time: bucket.bucketStart,
          open: bucket.open,
          high: bucket.high,
          low: bucket.low,
          close: bucket.close,
          volume: bucket.volume,
        };
        await appendKline(kline);
        void publisher.publish(
          CHANNELS.PRICE_TICK,
          JSON.stringify({ event: WS_EVENTS.PRICE_KLINE, data: kline })
        );
      }
    }
  }
}

export const mockPriceEngine = new MockPriceEngine();
