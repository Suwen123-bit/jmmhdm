import { eq, and, sql, gte } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { db } from '../db/client.js';
import { trades, users } from '../db/schema.js';
import {
  freezeBalanceTx,
  unfreezeBalance,
  consumeFrozenBalance,
  changeBalance,
} from './walletService.js';
import { getRiskConfig } from './riskConfigService.js';
import { getLatestTick, getKlines } from './priceCache.js';
import { getSettlementPrice } from './htxPriceEngine.js';
import { distributeCommission } from './agentService.js';
import { getConfig } from './featureService.js';
import { CONFIG_KEYS, DEFAULT_CONFIG } from '@app/shared';
import type { TradeOpenInput } from '@app/shared';
import { AppError } from '../middleware/errorHandler.js';
import { settlementQueue } from '../jobs/queues.js';
import { logger } from '../logger.js';
import { publisher, CHANNELS } from '../redis.js';
import { WS_EVENTS } from '@app/shared';
import { tradesOpenedTotal, tradesSettledTotal } from '../metrics.js';

/**
 * 开仓
 */
export async function openTrade(userId: number, input: TradeOpenInput) {
  const { symbol, direction, amount, duration } = input;

  // 加载风控配置
  const riskCfg = await getRiskConfig(symbol, duration);
  if (!riskCfg || !riskCfg.enabled) {
    throw new AppError('SYMBOL_DISABLED', '该交易对/周期暂未开放', 400);
  }

  // 全局上下限检查
  const [minAmt, maxAmt] = await Promise.all([
    getConfig<number>(CONFIG_KEYS.TRADE_MIN_AMOUNT, DEFAULT_CONFIG.TRADE_MIN_AMOUNT),
    getConfig<number>(CONFIG_KEYS.TRADE_MAX_AMOUNT, DEFAULT_CONFIG.TRADE_MAX_AMOUNT),
  ]);
  if (amount < (minAmt ?? 10)) {
    throw new AppError('AMOUNT_TOO_SMALL', `最低投注 ${minAmt} USDT`, 400);
  }
  if (amount > (maxAmt ?? 10000)) {
    throw new AppError('AMOUNT_TOO_LARGE', `最高投注 ${maxAmt} USDT`, 400);
  }
  if (amount > riskCfg.maxSingleBet) {
    throw new AppError('EXCEED_SINGLE_LIMIT', `本交易对单笔限额 ${riskCfg.maxSingleBet} USDT`, 400);
  }

  // 取最新价格作为开仓价（外部 IO，置于事务外）
  const tick = await getLatestTick(symbol);
  if (!tick || tick.price <= 0) {
    throw new AppError('PRICE_UNAVAILABLE', '行情暂不可用，请稍后再试', 503);
  }
  const entryPrice = tick.price;
  const settleAt = new Date(Date.now() + duration * 1000);

  // 单事务内：advisory lock(同 symbol+duration 串行) + 敞口检查 + 冻结资金 + 写订单
  // 避免 read-then-insert 的 TOCTOU 竞态，及失败时残留冻结资金
  const trade = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`trade:${symbol}:${duration}`}, 0))`);

    const exposureRow = await tx
      .select({ total: sql<string>`COALESCE(SUM(${trades.amount}), 0)::text` })
      .from(trades)
      .where(
        and(
          eq(trades.symbol, symbol),
          eq(trades.duration, duration),
          eq(trades.status, 'open')
        )
      );
    const currentExposure = Number(exposureRow[0]?.total ?? 0);
    if (currentExposure + amount > riskCfg.maxTotalExposure) {
      throw new AppError('EXCEED_TOTAL_EXPOSURE', '当前交易对敞口已达上限，请稍后再试', 400);
    }

    // 先创建订单获取 id（避免冻结流水使用 'pending' 占位）
    const inserted = await tx
      .insert(trades)
      .values({
        userId,
        symbol,
        direction,
        amount: amount.toFixed(6),
        duration,
        entryPrice: entryPrice.toFixed(8),
        payoutRate: riskCfg.payoutRate.toFixed(4),
        status: 'open',
        settleAt,
      })
      .returning();
    const t = inserted[0]!;

    await freezeBalanceTx(
      tx,
      userId,
      amount,
      'trade_open',
      'trade',
      t.id,
      `开仓 ${symbol.toUpperCase()} ${direction === 'call' ? '买涨' : '买跌'} ${amount} USDT`
    );

    return t;
  });

  // 调度结算任务
  await settlementQueue.add(
    'settle',
    { tradeId: trade.id },
    {
      delay: duration * 1000 + 200, // 略多 200ms 容错
      removeOnComplete: 500,
      removeOnFail: 1000,
    }
  );

  // 推送给用户
  void publisher.publish(
    CHANNELS.USER_EVENT,
    JSON.stringify({
      userId,
      event: WS_EVENTS.TRADE_OPENED,
      data: trade,
    })
  );

  tradesOpenedTotal.inc({ symbol, direction });
  logger.info(
    { userId, tradeId: trade.id, symbol, direction, amount, settleAt },
    '[trade] opened'
  );
  return trade;
}

/**
 * 结算交易（由 BullMQ Worker 调用）
 */
export async function settleTrade(tradeId: number): Promise<void> {
  const peek = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
  const trade = peek[0];
  if (!trade) {
    logger.warn({ tradeId }, '[trade] settle: not found');
    return;
  }
  if (trade.status !== 'open') {
    logger.debug({ tradeId, status: trade.status }, '[trade] settle: already processed');
    return;
  }

  const entryPrice = Number(trade.entryPrice);
  const settlePrice = await getSettlementPrice(trade.symbol, trade.duration, entryPrice);

  let result: 'win' | 'lose' | 'draw';
  if (settlePrice === entryPrice) result = 'draw';
  else if (trade.direction === 'call') result = settlePrice > entryPrice ? 'win' : 'lose';
  else result = settlePrice < entryPrice ? 'win' : 'lose';

  const amount = new Decimal(trade.amount);
  const payoutRate = new Decimal(trade.payoutRate);

  let profit = new Decimal(0);
  if (result === 'win') {
    profit = amount.mul(payoutRate);
  } else if (result === 'lose') {
    profit = amount.negated();
  }

  // 原子化状态翻转：只允许从 open → settled。并发 worker 时仅一个能成功。
  const flipped = await db
    .update(trades)
    .set({
      status: 'settled',
      result,
      exitPrice: settlePrice.toFixed(8),
      profit: profit.toFixed(6),
      settledAt: new Date(),
    })
    .where(and(eq(trades.id, tradeId), eq(trades.status, 'open')))
    .returning({ id: trades.id });
  if (flipped.length === 0) {
    logger.debug({ tradeId }, '[trade] settle: race lost, another worker already settled');
    return;
  }

  // 资金处理：先解冻本金回余额（draw / win 情况）；输则消费冻结资金
  if (result === 'lose') {
    await consumeFrozenBalance(
      trade.userId,
      amount.toFixed(6),
      'trade_settle_lose',
      'trade',
      tradeId,
      `订单 #${tradeId} 结算 - 亏损`
    );
  } else {
    // 退还本金
    await unfreezeBalance(
      trade.userId,
      amount.toFixed(6),
      'trade_refund',
      'trade',
      tradeId,
      `订单 #${tradeId} 退还本金`
    );
    if (result === 'win') {
      await changeBalance({
        userId: trade.userId,
        amount: profit.toFixed(6),
        type: 'trade_settle_win',
        refType: 'trade',
        refId: tradeId,
        description: `订单 #${tradeId} 盈利`,
      });
    }
  }

  // 推送结算结果
  void publisher.publish(
    CHANNELS.USER_EVENT,
    JSON.stringify({
      userId: trade.userId,
      event: WS_EVENTS.TRADE_SETTLED,
      data: {
        tradeId,
        result,
        entryPrice,
        exitPrice: settlePrice,
        profit: profit.toFixed(6),
      },
    })
  );

  // 代理佣金（仅亏损订单的本金参与平台抽水分成）
  if (result === 'lose') {
    const platformFeeRate =
      (await getConfig<number>('platform.fee_rate', DEFAULT_CONFIG.PLATFORM_FEE_RATE)) ??
      DEFAULT_CONFIG.PLATFORM_FEE_RATE;
    const baseAmount = amount.mul(platformFeeRate).toNumber();
    if (baseAmount > 0) {
      await distributeCommission({
        fromUserId: trade.userId,
        sourceType: 'trade',
        sourceId: tradeId,
        baseAmount,
      });
    }
  }

  tradesSettledTotal.inc({ symbol: trade.symbol, result });
  logger.info(
    { tradeId, userId: trade.userId, result, entryPrice, settlePrice, profit: profit.toFixed(6) },
    '[trade] settled'
  );
}

/**
 * 启动恢复扫描：进程重启后，重新调度未结算订单
 */
export async function recoverPendingTrades(): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(trades)
    .where(eq(trades.status, 'open'));
  for (const t of rows) {
    const delay = Math.max(0, t.settleAt.getTime() - now.getTime() + 200);
    await settlementQueue.add(
      'settle',
      { tradeId: t.id },
      { delay, removeOnComplete: 500, removeOnFail: 1000 }
    );
  }
  if (rows.length > 0) {
    logger.info({ count: rows.length }, '[trade] recovered pending trades');
  }
}

/**
 * 用户订单列表
 */
export async function listUserTrades(opts: {
  userId: number;
  status: 'open' | 'settled' | 'all';
  page: number;
  pageSize: number;
}) {
  const offset = (opts.page - 1) * opts.pageSize;
  let where;
  if (opts.status === 'all') {
    where = eq(trades.userId, opts.userId);
  } else {
    where = and(eq(trades.userId, opts.userId), eq(trades.status, opts.status));
  }
  const [items, totalRow] = await Promise.all([
    db.select().from(trades).where(where).orderBy(sql`${trades.createdAt} DESC`).limit(opts.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(trades).where(where),
  ]);
  return {
    items,
    total: totalRow[0]?.count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
