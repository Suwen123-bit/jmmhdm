import WebSocket from 'ws';
import pako from 'pako';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { setLatestTick, appendKline, getLatestTick } from './priceCache.js';
import { getRiskConfig } from './riskConfigService.js';
import { publisher, CHANNELS } from '../redis.js';
import { SUPPORTED_SYMBOLS, WS_EVENTS } from '@app/shared';
import type { PriceTick, Kline } from '@app/shared';

/**
 * HTX K 线周期 → 秒数（用于映射风控配置 duration）
 * 因当前风控配置只支持 [60, 300, 600]，将更长周期向下取整到 600s
 */
const INTERVAL_TO_SECONDS: Record<string, number> = {
  '1min': 60,
  '5min': 300,
  '15min': 600,
  '30min': 600,
  '60min': 600,
};

interface HtxKlineMsg {
  ch: string;
  ts: number;
  tick: { id: number; open: number; close: number; low: number; high: number; amount: number; vol: number; count: number };
}

interface HtxTradeMsg {
  ch: string;
  ts: number;
  tick: { id: number; ts: number; data: Array<{ price: number; amount: number; direction: string }> };
}

interface HtxDetailMsg {
  ch: string;
  ts: number;
  tick: {
    open: number;
    close: number;
    high: number;
    low: number;
    vol: number;
    amount: number;
    count: number;
  };
}

class HtxPriceEngine {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriptions = new Set<string>();
  private connected = false;

  start(): void {
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  private connect(): void {
    logger.info(`[htx] connecting to ${env.HTX_WS_URL}`);
    this.ws = new WebSocket(env.HTX_WS_URL);

    this.ws.on('open', () => {
      logger.info('[htx] connected');
      this.connected = true;
      // 订阅所有交易对的多周期 K 线（1/5/15/30/60min）+ market detail + trade.detail
      const intervals = ['1min', '5min', '15min', '30min', '60min'];
      for (const sym of SUPPORTED_SYMBOLS) {
        for (const i of intervals) this.subscribe(`market.${sym}.kline.${i}`);
        this.subscribe(`market.${sym}.detail`);
        this.subscribe(`market.${sym}.trade.detail`);
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const decompressed = pako.inflate(data as Uint8Array, { to: 'string' });
        const msg = JSON.parse(decompressed);

        // 心跳
        if (msg.ping) {
          this.ws?.send(JSON.stringify({ pong: msg.ping }));
          return;
        }

        // 订阅响应
        if (msg.subbed) {
          logger.debug({ ch: msg.subbed }, '[htx] subscribed');
          return;
        }

        if (msg.ch && msg.tick) {
          this.handleTickMessage(msg);
        }
      } catch (e: any) {
        logger.error({ err: e.message }, '[htx] parse error');
      }
    });

    this.ws.on('close', () => {
      logger.warn('[htx] connection closed, reconnecting in 5s');
      this.connected = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (e) => {
      logger.error({ err: e.message }, '[htx] error');
    });
  }

  private subscribe(channel: string): void {
    this.subscriptions.add(channel);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ sub: channel, id: channel }));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private async handleTickMessage(msg: any): Promise<void> {
    const ch: string = msg.ch;
    // market.btcusdt.kline.1min
    const parts = ch.split('.');
    if (parts[0] !== 'market') return;
    const symbol = parts[1]!;

    if (parts[2] === 'kline') {
      const interval = parts[3] || '1min';
      const tick = (msg as HtxKlineMsg).tick;
      // 按当前周期取风控（duration 秒数）映射 priceOffsetBps
      const durSec = INTERVAL_TO_SECONDS[interval] ?? 60;
      const kline: Kline = {
        symbol,
        interval: interval as any,
        time: tick.id, // 秒时间戳
        open: await this.applyRiskOffset(symbol, tick.open, durSec),
        high: await this.applyRiskOffset(symbol, tick.high, durSec),
        low: await this.applyRiskOffset(symbol, tick.low, durSec),
        close: await this.applyRiskOffset(symbol, tick.close, durSec),
        volume: tick.vol,
      };
      await appendKline(kline);
      void publisher.publish(
        CHANNELS.PRICE_TICK,
        JSON.stringify({ event: WS_EVENTS.PRICE_KLINE, data: kline })
      );
    } else if (parts[2] === 'detail') {
      const tick = (msg as HtxDetailMsg).tick;
      const adjustedPrice = await this.applyRiskOffset(symbol, tick.close);
      const priceTick: PriceTick = {
        symbol,
        price: adjustedPrice,
        volume24h: tick.vol,
        change24h: tick.open > 0 ? (tick.close - tick.open) / tick.open : 0,
        high24h: await this.applyRiskOffset(symbol, tick.high),
        low24h: await this.applyRiskOffset(symbol, tick.low),
        ts: msg.ts,
      };
      await setLatestTick(priceTick);
      void publisher.publish(
        CHANNELS.PRICE_TICK,
        JSON.stringify({ event: WS_EVENTS.PRICE_TICK, data: priceTick })
      );
    }
  }

  /**
   * 风控价格微调：应用 priceOffsetBps（基点偏移）
   * 注意：此处不应用 trendBias（仅在结算时使用），保持图表展示真实方向
   *
   * @param duration 持仓周期秒数；按交易对+周期独立配置 priceOffsetBps
   */
  private async applyRiskOffset(symbol: string, price: number, duration = 60): Promise<number> {
    const cfg = await getRiskConfig(symbol, duration);
    if (!cfg || cfg.priceOffsetBps === 0) return price;
    return price * (1 + cfg.priceOffsetBps / 10000);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const htxPriceEngine = new HtxPriceEngine();

/**
 * 获取结算价格 — 应用 delayMs 取价延迟 + trendBias 微调以平衡平台敞口
 *
 *  - delayMs > 0: 等待该毫秒后再读取最新价（让用户"看不到"本毫秒之后的价位回退）
 *  - trendBias > 0: 倾向上涨 / < 0: 倾向下跌 / 0: 完全真实
 */
export async function getSettlementPrice(
  symbol: string,
  duration: number,
  entryPrice: number
): Promise<number> {
  const cfg = await getRiskConfig(symbol, duration);
  // delayMs 应用：在事先调度的结算时刻基础上再延后取价
  if (cfg && cfg.delayMs > 0) {
    await new Promise((r) => setTimeout(r, Math.min(5000, cfg.delayMs)));
  }
  const tick = await getLatestTick(symbol);
  if (!tick) {
    // 兜底：返回 entryPrice (退款)
    return entryPrice;
  }
  let price = tick.price;
  if (cfg && cfg.trendBias !== 0) {
    // 在 [-1, 1] 范围内对结算价做小幅偏移：相对 entry 的方向偏移
    const bias = cfg.trendBias; // -1 ~ 1
    // 偏移幅度：当前价与开仓价差额的 |bias| 倍 + 同向
    const diff = price - entryPrice;
    price = price + diff * bias * 0.1; // 衰减系数 0.1 防止过度偏离
  }
  return price;
}
