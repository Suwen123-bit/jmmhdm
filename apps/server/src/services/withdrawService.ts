import { eq, and, gte, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import Decimal from 'decimal.js';
import { db } from '../db/client.js';
import { users, withdrawals } from '../db/schema.js';
import { freezeBalanceTx, unfreezeBalance } from './walletService.js';
import { verifyTotp, isTotpEnabled } from './otpService.js';
import { getConfig } from './featureService.js';
import { CONFIG_KEYS, DEFAULT_CONFIG } from '@app/shared';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

export async function createWithdrawal(opts: {
  userId: number;
  currency: string;
  network: string;
  toAddress: string;
  amount: number;
  fundPassword: string;
  totpCode?: string;
}) {
  // 资金密码验证
  const u = await db
    .select({ fundPwHash: users.fundPasswordHash })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
  if (!u[0].fundPwHash) throw new AppError('FUND_PW_NOT_SET', '请先设置资金密码', 400);
  const ok = await bcrypt.compare(opts.fundPassword, u[0].fundPwHash);
  if (!ok) throw new AppError('FUND_PW_INVALID', '资金密码错误', 400);

  // TOTP 验证（若启用）
  if (await isTotpEnabled(opts.userId)) {
    if (!opts.totpCode) throw new AppError('TOTP_REQUIRED', '请输入二步验证码', 400);
    await verifyTotp(opts.userId, opts.totpCode, true);
  }

  // 限额检查
  const minAmt = (await getConfig<number>(CONFIG_KEYS.WITHDRAW_MIN_AMOUNT, DEFAULT_CONFIG.WITHDRAW_MIN_AMOUNT)) ?? DEFAULT_CONFIG.WITHDRAW_MIN_AMOUNT;
  const dailyLimit = (await getConfig<number>(CONFIG_KEYS.WITHDRAW_DAILY_LIMIT, DEFAULT_CONFIG.WITHDRAW_DAILY_LIMIT)) ?? DEFAULT_CONFIG.WITHDRAW_DAILY_LIMIT;
  if (opts.amount < minAmt) throw new AppError('AMOUNT_TOO_SMALL', `最低提现金额 ${minAmt} USDT`, 400);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sumRow = await db
    .select({ sum: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text` })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.userId, opts.userId),
        gte(withdrawals.createdAt, today),
        sql`${withdrawals.status} != 'rejected' AND ${withdrawals.status} != 'failed'`
      )
    );
  const todaySum = Number(sumRow[0]?.sum ?? 0);
  if (todaySum + opts.amount > dailyLimit) {
    throw new AppError('DAILY_LIMIT_EXCEEDED', `已超过每日提现限额 ${dailyLimit} USDT`, 400);
  }

  // 手续费
  const feeRate = (await getConfig<number>('withdraw.fee_rate', 0.01)) ?? 0.01;
  const fee = new Decimal(opts.amount).mul(feeRate).toFixed(6);

  // 自动审核阈值
  const autoApproveThreshold = (await getConfig<number>(CONFIG_KEYS.WITHDRAW_AUTO_APPROVE_THRESHOLD, DEFAULT_CONFIG.WITHDRAW_AUTO_APPROVE_THRESHOLD)) ?? DEFAULT_CONFIG.WITHDRAW_AUTO_APPROVE_THRESHOLD;
  const initialStatus = opts.amount <= autoApproveThreshold ? 'reviewing' : 'pending';

  // 同一事务内：先 insert withdrawals 拿到 id → 用真实 id 作为冻结流水 refId
  const totalFreeze = new Decimal(opts.amount).plus(fee);
  const withdrawal = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(withdrawals)
      .values({
        userId: opts.userId,
        currency: opts.currency,
        network: opts.network,
        toAddress: opts.toAddress,
        amount: opts.amount.toFixed(6),
        fee,
        status: initialStatus,
        riskScore: 0,
      })
      .returning();
    const w = inserted[0]!;
    await freezeBalanceTx(
      tx,
      opts.userId,
      totalFreeze.toFixed(6),
      'withdraw',
      'withdrawal',
      w.id,
      `提现申请 #${w.id} ${opts.amount} ${opts.currency.toUpperCase()} (含手续费 ${fee})`
    );
    return w;
  });

  logger.info({ userId: opts.userId, withdrawId: withdrawal.id, amount: opts.amount }, '[withdraw] requested');
  return withdrawal;
}

export async function approveWithdrawal(withdrawId: number, adminId: number, note?: string) {
  // 1. 原子翻转 pending/reviewing → approved（防并发审核）
  const w = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawId))
      .for('update');
    const row = rows[0];
    if (!row) throw new AppError('WITHDRAW_NOT_FOUND', '提现单不存在', 404);
    if (!['pending', 'reviewing'].includes(row.status)) {
      throw new AppError('INVALID_STATUS', '当前状态不可审核', 400);
    }
    await tx
      .update(withdrawals)
      .set({
        status: 'approved',
        reviewedBy: adminId,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(withdrawals.id, withdrawId));
    return row;
  });

  // 2. 真实发起 NOWPayments mass payout；成功 → status=processing，等 IPN 终态
  //    若 NOWPayments 凭据未配置，executeWithdrawalViaPayout 会保留 processing 由运维处理
  try {
    const { executeWithdrawalViaPayout } = await import('./nowpayService.js');
    await executeWithdrawalViaPayout(withdrawId);
  } catch (e: any) {
    logger.error(
      { withdrawId, adminId, err: e?.message },
      '[withdraw] payout dispatch failed, kept in processing for manual review'
    );
  }
  logger.info({ withdrawId, adminId }, '[withdraw] approved');
  return w;
}

export async function rejectWithdrawal(withdrawId: number, adminId: number, note: string) {
  const rows = await db.select().from(withdrawals).where(eq(withdrawals.id, withdrawId)).limit(1);
  const w = rows[0];
  if (!w) throw new AppError('WITHDRAW_NOT_FOUND', '提现单不存在', 404);
  if (!['pending', 'reviewing'].includes(w.status)) {
    throw new AppError('INVALID_STATUS', '当前状态不可审核', 400);
  }
  await db
    .update(withdrawals)
    .set({ status: 'rejected', reviewedBy: adminId, reviewNote: note, reviewedAt: new Date() })
    .where(eq(withdrawals.id, withdrawId));

  // 解冻退还
  const total = new Decimal(w.amount).plus(w.fee).toFixed(6);
  await unfreezeBalance(
    w.userId,
    total,
    'withdraw',
    'withdrawal',
    withdrawId,
    `提现拒绝 #${withdrawId} - ${note}`
  );
  logger.info({ withdrawId, adminId, note }, '[withdraw] rejected');
}
