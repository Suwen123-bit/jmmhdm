import { eq, sql, and, gte } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { db } from '../db/client.js';
import { agents, commissions, users } from '../db/schema.js';
import { changeBalanceTx } from './walletService.js';
import { getConfig } from './featureService.js';
import { CONFIG_KEYS, DEFAULT_CONFIG } from '@app/shared';
import { logger } from '../logger.js';

/**
 * 根据用户的 parent_id 链返回最多三层上级 user_id
 */
export async function getUpline(userId: number): Promise<number[]> {
  const upline: number[] = [];
  let currentId: number | null = userId;
  for (let i = 0; i < 3; i++) {
    if (currentId === null) break;
    const rows: { parentId: number | null }[] = await db
      .select({ parentId: users.parentId })
      .from(users)
      .where(eq(users.id, currentId))
      .limit(1);
    const parent = rows[0]?.parentId ?? null;
    if (!parent) break;
    upline.push(parent);
    currentId = parent;
  }
  return upline;
}

/**
 * 在交易结算时调用：根据交易金额（手续费基数）计算并落库三级佣金
 */
export async function distributeCommission(opts: {
  fromUserId: number;
  sourceType: 'trade' | 'blindbox';
  sourceId: number;
  baseAmount: number; // 计算基数（如交易金额 * 平台抽水率）
}): Promise<void> {
  const upline = await getUpline(opts.fromUserId);
  if (upline.length === 0) return;

  const [l1Default, l2Default, l3Default] = await Promise.all([
    getConfig<number>(CONFIG_KEYS.AGENT_L1_RATE, DEFAULT_CONFIG.AGENT_L1_RATE),
    getConfig<number>(CONFIG_KEYS.AGENT_L2_RATE, DEFAULT_CONFIG.AGENT_L2_RATE),
    getConfig<number>(CONFIG_KEYS.AGENT_L3_RATE, DEFAULT_CONFIG.AGENT_L3_RATE),
  ]);
  const defaults = [l1Default ?? 0.3, l2Default ?? 0.2, l3Default ?? 0.1];

  for (let i = 0; i < upline.length; i++) {
    const agentUserId = upline[i]!;
    const level = i + 1;

    // 优先取代理自定义佣金率
    const agentRow = await db
      .select({
        l1: agents.l1Rate,
        l2: agents.l2Rate,
        l3: agents.l3Rate,
      })
      .from(agents)
      .where(eq(agents.userId, agentUserId))
      .limit(1);
    const customRate = agentRow[0]
      ? Number(level === 1 ? agentRow[0].l1 : level === 2 ? agentRow[0].l2 : agentRow[0].l3)
      : null;
    const rate = customRate ?? defaults[i] ?? 0;
    if (rate <= 0) continue;

    const amount = new Decimal(opts.baseAmount).mul(rate).toFixed(6);
    if (Number(amount) <= 0) continue;

    try {
      await db.transaction(async (tx) => {
        // 利用 UNIQUE(source_type, source_id, level, agent_user_id) 防重；
        // 若返回空数组，说明已发放过（多次调用幂等），直接跳过后续入账与累计
        const ins = await tx
          .insert(commissions)
          .values({
            agentUserId,
            fromUserId: opts.fromUserId,
            sourceType: opts.sourceType,
            sourceId: opts.sourceId,
            level,
            sourceAmount: opts.baseAmount.toFixed(6),
            commissionRate: rate.toFixed(4),
            commissionAmount: amount,
            settled: true,
            settledAt: new Date(),
          })
          .onConflictDoNothing({
            target: [
              commissions.sourceType,
              commissions.sourceId,
              commissions.level,
              commissions.agentUserId,
            ],
          })
          .returning({ id: commissions.id });

        if (ins.length === 0) {
          // 已发过，幂等跳过
          return;
        }

        // 累计 agent 总佣金
        await tx
          .insert(agents)
          .values({
            userId: agentUserId,
            parentId: null,
            totalCommission: amount,
            l1Rate: defaults[0]!.toFixed(4),
            l2Rate: defaults[1]!.toFixed(4),
            l3Rate: defaults[2]!.toFixed(4),
          })
          .onConflictDoUpdate({
            target: agents.userId,
            set: {
              totalCommission: sql`${agents.totalCommission} + ${amount}`,
            },
          });

        // 资金到账（与 commissions/agents 写入同一事务，保证"已记账即到账"）
        await changeBalanceTx(tx, {
          userId: agentUserId,
          amount,
          type: 'commission',
          refType: opts.sourceType,
          refId: opts.sourceId,
          description: `L${level} 代理佣金 (来自用户 #${opts.fromUserId})`,
        });
      });

      logger.info(
        { agentUserId, level, amount, fromUserId: opts.fromUserId },
        '[agent] commission distributed'
      );
    } catch (err: any) {
      // 单层失败不阻断其他层级（例如某代理被冻结）
      logger.error(
        { err: err?.message, agentUserId, level, amount, fromUserId: opts.fromUserId },
        '[agent] commission distribution failed, skipping this level'
      );
    }
  }
}

/**
 * 获取代理推广统计
 */
export async function getAgentStats(userId: number) {
  // 直推数量
  const directRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.parentId, userId));
  const l1Count = directRows[0]?.count ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 86400_000);
  const monthStart = new Date(Date.now() - 30 * 86400_000);

  const [todayRow, weekRow, monthRow, totalRow] = await Promise.all([
    db
      .select({ sum: sql<string>`COALESCE(SUM(${commissions.commissionAmount}), 0)::text` })
      .from(commissions)
      .where(and(eq(commissions.agentUserId, userId), gte(commissions.createdAt, today))),
    db
      .select({ sum: sql<string>`COALESCE(SUM(${commissions.commissionAmount}), 0)::text` })
      .from(commissions)
      .where(and(eq(commissions.agentUserId, userId), gte(commissions.createdAt, weekStart))),
    db
      .select({ sum: sql<string>`COALESCE(SUM(${commissions.commissionAmount}), 0)::text` })
      .from(commissions)
      .where(and(eq(commissions.agentUserId, userId), gte(commissions.createdAt, monthStart))),
    db
      .select({ sum: sql<string>`COALESCE(SUM(${commissions.commissionAmount}), 0)::text` })
      .from(commissions)
      .where(eq(commissions.agentUserId, userId)),
  ]);

  return {
    l1Count,
    todayCommission: todayRow[0]?.sum ?? '0',
    weekCommission: weekRow[0]?.sum ?? '0',
    monthCommission: monthRow[0]?.sum ?? '0',
    totalCommission: totalRow[0]?.sum ?? '0',
  };
}
