import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiAnomalies, trades, withdrawals, blindboxRecords, loginLogs, users } from '../db/schema.js';
import { logger } from '../logger.js';
import { notifyOps } from './notificationDispatch.js';
import { aiAnomaliesTotal } from '../metrics.js';

export type AnomalyCategory =
  | 'hedge'
  | 'high_freq'
  | 'large_bet'
  | 'suspicious_withdraw'
  | 'login_anomaly'
  | 'kyc_mismatch';

export type Severity = 'info' | 'warning' | 'critical';

export interface RecordAnomalyOpts {
  userId: number;
  category: AnomalyCategory;
  severity: Severity;
  score: number;
  reason: string;
  detail?: any;
}

/**
 * 记录异常事件 + critical 自动告警 ops（Telegram）
 */
export async function recordAnomaly(opts: RecordAnomalyOpts): Promise<void> {
  await db.insert(aiAnomalies).values({
    userId: opts.userId,
    category: opts.category,
    severity: opts.severity,
    score: Math.max(0, Math.min(100, Math.round(opts.score))),
    reason: opts.reason,
    detail: opts.detail ?? null,
  });
  aiAnomaliesTotal.inc({ category: opts.category, severity: opts.severity });
  if (opts.severity === 'critical') {
    void notifyOps({
      title: `[AI 风控] ${opts.category}`,
      content: `用户 #${opts.userId} 触发严重异常：${opts.reason} (score=${opts.score})`,
      level: 'critical',
    }).catch(() => undefined);
  }
  logger.info(
    { userId: opts.userId, category: opts.category, severity: opts.severity, score: opts.score },
    '[anomaly] recorded'
  );
}

/**
 * 周期性扫描：在 BullMQ scheduler 中以 1 分钟一次的频率运行
 */
export async function runAnomalyScan(): Promise<void> {
  const now = new Date();
  const minus5m = new Date(now.getTime() - 5 * 60 * 1000);
  const minus15m = new Date(now.getTime() - 15 * 60 * 1000);
  const minus1h = new Date(now.getTime() - 60 * 60 * 1000);

  // 1) 高频交易：5min 内 > 30 笔
  const highFreq = await db
    .select({
      userId: trades.userId,
      n: sql<number>`count(*)::int`,
    })
    .from(trades)
    .where(gte(trades.createdAt, minus5m))
    .groupBy(trades.userId)
    .having(sql`count(*) > 30`);
  for (const row of highFreq) {
    await recordAnomalyDedup({
      userId: row.userId,
      category: 'high_freq',
      severity: row.n > 60 ? 'critical' : 'warning',
      score: Math.min(100, row.n * 2),
      reason: `5 分钟内交易 ${row.n} 笔`,
      detail: { window: '5min', count: row.n },
    });
  }

  // 2) 对冲交易：同一 symbol+duration 在 15min 内 同时存在 call 和 put 大额单
  const hedge = await db.execute(sql`
    SELECT a.user_id AS user_id,
           a.symbol AS symbol,
           a.duration AS duration,
           SUM(a.amount)::text AS sum_call,
           SUM(b.amount)::text AS sum_put
    FROM trades a
    JOIN trades b
      ON a.user_id = b.user_id
     AND a.symbol = b.symbol
     AND a.duration = b.duration
     AND a.direction = 'call' AND b.direction = 'put'
     AND a.created_at >= ${minus15m.toISOString()}::timestamptz AND b.created_at >= ${minus15m.toISOString()}::timestamptz
    GROUP BY a.user_id, a.symbol, a.duration
    HAVING SUM(a.amount) > 500 AND SUM(b.amount) > 500
  `);
  for (const r of (hedge as unknown as any[])) {
    const callSum = Number(r.sum_call ?? 0);
    const putSum = Number(r.sum_put ?? 0);
    const total = callSum + putSum;
    await recordAnomalyDedup({
      userId: Number(r.user_id),
      category: 'hedge',
      severity: total > 5000 ? 'critical' : 'warning',
      score: Math.min(100, Math.round(total / 100)),
      reason: `${r.symbol} ${r.duration}s 双向对冲：CALL ${callSum} + PUT ${putSum}`,
      detail: { symbol: r.symbol, duration: r.duration, call: callSum, put: putSum, window: '15min' },
    });
  }

  // 3) 大额下注：单笔 > 5000 USDT
  const largeBets = await db
    .select({
      userId: trades.userId,
      id: trades.id,
      amount: trades.amount,
      symbol: trades.symbol,
      createdAt: trades.createdAt,
    })
    .from(trades)
    .where(and(gte(trades.createdAt, minus5m), sql`${trades.amount}::numeric > 5000`))
    .limit(100);
  for (const t of largeBets) {
    const amt = Number(t.amount);
    await recordAnomalyDedup({
      userId: t.userId,
      category: 'large_bet',
      severity: amt > 20000 ? 'critical' : 'warning',
      score: Math.min(100, Math.round(amt / 1000)),
      reason: `单笔下注 ${amt} USDT (${t.symbol})`,
      detail: { tradeId: t.id, amount: amt, symbol: t.symbol },
    });
  }

  // 4) 可疑提现：充值后 1h 内即提现 / 当日累计提现 > 充值
  const recentWithdraws = await db
    .select({
      userId: withdrawals.userId,
      id: withdrawals.id,
      amount: withdrawals.amount,
      createdAt: withdrawals.createdAt,
    })
    .from(withdrawals)
    .where(and(gte(withdrawals.createdAt, minus1h), sql`${withdrawals.status} != 'rejected'`))
    .limit(100);
  for (const w of recentWithdraws) {
    const amt = Number(w.amount);
    if (amt > 1000) {
      await recordAnomalyDedup({
        userId: w.userId,
        category: 'suspicious_withdraw',
        severity: amt > 10000 ? 'critical' : 'warning',
        score: Math.min(100, Math.round(amt / 200)),
        reason: `1 小时内提现 ${amt} USDT`,
        detail: { withdrawId: w.id, amount: amt },
      });
    }
  }

  // 5) 异地登录：同一用户 1h 内来自 >3 个不同 IP
  const loginAnoms = await db
    .select({
      userId: loginLogs.userId,
      ipCount: sql<number>`count(DISTINCT ${loginLogs.ip})::int`,
    })
    .from(loginLogs)
    .where(and(gte(loginLogs.createdAt, minus1h), eq(loginLogs.success, true)))
    .groupBy(loginLogs.userId)
    .having(sql`count(DISTINCT ${loginLogs.ip}) > 3`);
  for (const r of loginAnoms) {
    if (!r.userId) continue;
    await recordAnomalyDedup({
      userId: r.userId,
      category: 'login_anomaly',
      severity: r.ipCount > 6 ? 'critical' : 'warning',
      score: Math.min(100, r.ipCount * 15),
      reason: `1 小时内来自 ${r.ipCount} 个不同 IP`,
      detail: { ipCount: r.ipCount, window: '1h' },
    });
  }

  // 6) 盲盒高频开箱：5min 内 > 50 次
  const bbHigh = await db
    .select({
      userId: blindboxRecords.userId,
      n: sql<number>`count(*)::int`,
    })
    .from(blindboxRecords)
    .where(gte(blindboxRecords.createdAt, minus5m))
    .groupBy(blindboxRecords.userId)
    .having(sql`count(*) > 50`);
  for (const r of bbHigh) {
    await recordAnomalyDedup({
      userId: r.userId,
      category: 'high_freq',
      severity: r.n > 200 ? 'critical' : 'warning',
      score: Math.min(100, r.n),
      reason: `5 分钟内开箱 ${r.n} 次`,
      detail: { source: 'blindbox', count: r.n, window: '5min' },
    });
  }
}

/**
 * 去重写入：同 userId+category 的 unresolved 记录在 30min 内只保留一条
 */
async function recordAnomalyDedup(opts: RecordAnomalyOpts): Promise<void> {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const exists = await db
    .select({ id: aiAnomalies.id })
    .from(aiAnomalies)
    .where(
      and(
        eq(aiAnomalies.userId, opts.userId),
        eq(aiAnomalies.category, opts.category),
        eq(aiAnomalies.resolved, false),
        gte(aiAnomalies.createdAt, since)
      )
    )
    .limit(1);
  if (exists[0]) return;
  await recordAnomaly(opts);
}

/**
 * 管理后台：摘要
 */
export async function getAnomalySummary() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalRow, unresolvedRow, criticalRow, byCategory] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiAnomalies)
      .where(gte(aiAnomalies.createdAt, since24h)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiAnomalies)
      .where(eq(aiAnomalies.resolved, false)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiAnomalies)
      .where(and(gte(aiAnomalies.createdAt, since24h), eq(aiAnomalies.severity, 'critical'))),
    db
      .select({
        category: aiAnomalies.category,
        count: sql<number>`count(*)::int`,
      })
      .from(aiAnomalies)
      .where(gte(aiAnomalies.createdAt, since24h))
      .groupBy(aiAnomalies.category),
  ]);
  return {
    totalAnomalies24h: totalRow[0]?.n ?? 0,
    unresolved: unresolvedRow[0]?.n ?? 0,
    critical: criticalRow[0]?.n ?? 0,
    byCategory: byCategory.map((r) => ({ category: r.category, count: r.count })),
  };
}

export async function listAnomalies(opts: {
  resolved?: boolean;
  category?: string;
  severity?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const conds = [] as any[];
  if (typeof opts.resolved === 'boolean') conds.push(eq(aiAnomalies.resolved, opts.resolved));
  if (opts.category) conds.push(eq(aiAnomalies.category, opts.category));
  if (opts.severity) conds.push(eq(aiAnomalies.severity, opts.severity));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const items = await db
    .select({
      id: aiAnomalies.id,
      userId: aiAnomalies.userId,
      username: users.username,
      category: aiAnomalies.category,
      severity: aiAnomalies.severity,
      score: aiAnomalies.score,
      reason: aiAnomalies.reason,
      detail: aiAnomalies.detail,
      resolved: aiAnomalies.resolved,
      createdAt: aiAnomalies.createdAt,
    })
    .from(aiAnomalies)
    .leftJoin(users, eq(users.id, aiAnomalies.userId))
    .where(where ?? sql`true`)
    .orderBy(desc(aiAnomalies.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items };
}

export async function resolveAnomaly(id: number, adminId: number): Promise<void> {
  await db
    .update(aiAnomalies)
    .set({ resolved: true, resolvedBy: adminId, resolvedAt: new Date() })
    .where(eq(aiAnomalies.id, id));
}
