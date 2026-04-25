import { eq, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { db } from '../db/client.js';
import { users, walletLogs } from '../db/schema.js';
import type { WalletLogType } from '@app/shared';
import { AppError } from '../middleware/errorHandler.js';

export interface WalletChangeOpts {
  userId: number;
  amount: number | string; // 正数=增加, 负数=减少
  type: WalletLogType;
  refType?: string;
  refId?: string | number;
  description?: string;
}

/**
 * 内部：在已有事务中变更余额（用于跨服务原子组合，例：IPN 入账、佣金分发）
 * 注意：调用方负责事务的开启与提交。
 */
export async function changeBalanceTx(
  tx: any,
  opts: WalletChangeOpts
): Promise<{ balanceAfter: string }> {
  const amount = new Decimal(opts.amount);
  const rows = await tx
    .select({ balance: users.balance, status: users.status })
    .from(users)
    .where(eq(users.id, opts.userId))
    .for('update');

  if (!rows[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
  if (rows[0].status !== 'active') throw new AppError('ACCOUNT_DISABLED', '账户已停用', 403);

  const before = new Decimal(rows[0].balance);
  const after = before.plus(amount);
  if (after.isNegative()) {
    throw new AppError('INSUFFICIENT_BALANCE', '余额不足', 400);
  }

  await tx
    .update(users)
    .set({ balance: after.toFixed(6), updatedAt: new Date() })
    .where(eq(users.id, opts.userId));

  await tx.insert(walletLogs).values({
    userId: opts.userId,
    type: opts.type,
    amount: amount.toFixed(6),
    balanceBefore: before.toFixed(6),
    balanceAfter: after.toFixed(6),
    refType: opts.refType ?? null,
    refId: opts.refId !== undefined ? String(opts.refId) : null,
    description: opts.description ?? '',
  });

  return { balanceAfter: after.toFixed(6) };
}

/**
 * 余额变更（事务安全 + 流水记录）
 */
export async function changeBalance(opts: WalletChangeOpts): Promise<{ balanceAfter: string }> {
  return db.transaction(async (tx) => changeBalanceTx(tx, opts));
}

/**
 * 内部：在已有事务中冻结余额
 */
export async function freezeBalanceTx(
  tx: any,
  userId: number,
  amount: number | string,
  type: WalletLogType,
  refType: string,
  refId: string | number,
  description: string
): Promise<{ balanceAfter: string; frozenAfter: string }> {
  const amt = new Decimal(amount);
  if (amt.isNegative() || amt.isZero()) {
    throw new AppError('INVALID_AMOUNT', '金额必须大于 0', 400);
  }
  const rows = await tx
    .select({
      balance: users.balance,
      frozen: users.frozenBalance,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  if (!rows[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
  if (rows[0].status !== 'active') throw new AppError('ACCOUNT_DISABLED', '账户已停用', 403);

  const before = new Decimal(rows[0].balance);
  const after = before.minus(amt);
  if (after.isNegative()) throw new AppError('INSUFFICIENT_BALANCE', '余额不足', 400);
  const frozenAfter = new Decimal(rows[0].frozen).plus(amt);

  await tx
    .update(users)
    .set({
      balance: after.toFixed(6),
      frozenBalance: frozenAfter.toFixed(6),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await tx.insert(walletLogs).values({
    userId,
    type,
    amount: amt.negated().toFixed(6),
    balanceBefore: before.toFixed(6),
    balanceAfter: after.toFixed(6),
    refType,
    refId: String(refId),
    description,
  });

  return { balanceAfter: after.toFixed(6), frozenAfter: frozenAfter.toFixed(6) };
}

/**
 * 冻结余额（用于交易开仓 / 提现锁定）
 */
export async function freezeBalance(
  userId: number,
  amount: number | string,
  type: WalletLogType,
  refType: string,
  refId: string | number,
  description: string
): Promise<{ balanceAfter: string; frozenAfter: string }> {
  return db.transaction(async (tx) =>
    freezeBalanceTx(tx, userId, amount, type, refType, refId, description)
  );
}

/**
 * 解冻余额（资金从 frozen 退回 balance）
 */
export async function unfreezeBalance(
  userId: number,
  amount: number | string,
  type: WalletLogType,
  refType: string,
  refId: string | number,
  description: string
): Promise<void> {
  const amt = new Decimal(amount);
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ balance: users.balance, frozen: users.frozenBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!rows[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
    const before = new Decimal(rows[0].balance);
    const frozen = new Decimal(rows[0].frozen);
    if (frozen.lessThan(amt)) {
      throw new AppError('INSUFFICIENT_FROZEN', '冻结余额不足', 400);
    }
    const after = before.plus(amt);
    const frozenAfter = frozen.minus(amt);
    await tx
      .update(users)
      .set({
        balance: after.toFixed(6),
        frozenBalance: frozenAfter.toFixed(6),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.insert(walletLogs).values({
      userId,
      type,
      amount: amt.toFixed(6),
      balanceBefore: before.toFixed(6),
      balanceAfter: after.toFixed(6),
      refType,
      refId: String(refId),
      description,
    });
  });
}

/**
 * 扣除冻结余额（提现完成、交易输等场景）— 不再退回
 */
export async function consumeFrozenBalance(
  userId: number,
  amount: number | string,
  type: WalletLogType,
  refType: string,
  refId: string | number,
  description: string
): Promise<void> {
  const amt = new Decimal(amount);
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ balance: users.balance, frozen: users.frozenBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!rows[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
    const frozen = new Decimal(rows[0].frozen);
    if (frozen.lessThan(amt)) {
      throw new AppError('INSUFFICIENT_FROZEN', '冻结余额不足', 400);
    }
    const balance = new Decimal(rows[0].balance);
    const frozenAfter = frozen.minus(amt);
    await tx
      .update(users)
      .set({ frozenBalance: frozenAfter.toFixed(6), updatedAt: new Date() })
      .where(eq(users.id, userId));

    await tx.insert(walletLogs).values({
      userId,
      type,
      amount: amt.negated().toFixed(6),
      balanceBefore: balance.toFixed(6),
      balanceAfter: balance.toFixed(6),
      refType,
      refId: String(refId),
      description,
    });
  });
}

/**
 * 获取用户余额
 */
export async function getBalance(userId: number): Promise<{ balance: string; frozen: string }> {
  const rows = await db
    .select({ balance: users.balance, frozen: users.frozenBalance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
  return { balance: rows[0].balance, frozen: rows[0].frozen };
}
