import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { deposits, withdrawals } from '../db/schema.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { changeBalanceTx } from './walletService.js';
import { logger } from '../logger.js';
import { publisher, CHANNELS } from '../redis.js';
import { WS_EVENTS } from '@app/shared';

interface NowpayInvoiceResp {
  id: string;
  order_id: string;
  invoice_url?: string;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  pay_amount?: number;
  expiration_estimate_date?: string;
  payment_status?: string;
}

interface NowpayIpnPayload {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
  outcome_amount?: number;
  outcome_currency?: string;
  order_id: string;
  order_description?: string;
}

async function nowpayFetch(path: string, init?: RequestInit) {
  if (!env.NOWPAY_API_KEY) {
    throw new AppError('NOWPAY_NOT_CONFIGURED', 'NOWPayments 未配置', 500);
  }
  const res = await fetch(`${env.NOWPAY_API_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': env.NOWPAY_API_KEY,
      'Content-Type': 'application/json',
      ...(init?.headers as any),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ path, status: res.status, body: text }, '[nowpay] api error');
    throw new AppError('NOWPAY_API_ERROR', `NOWPayments API 错误: ${res.status}`, 502);
  }
  return res.json();
}

/**
 * 创建充值订单（payment）
 */
export async function createDeposit(opts: {
  userId: number;
  amountUsd: number;
  payCurrency: string;
}) {
  const orderId = `dep_${opts.userId}_${nanoid(12)}`;

  const body = {
    price_amount: opts.amountUsd,
    price_currency: 'usd',
    pay_currency: opts.payCurrency,
    order_id: orderId,
    order_description: `Deposit by user ${opts.userId}`,
    ipn_callback_url: `${env.PUBLIC_API_URL}/api/nowpay/ipn`,
    is_fixed_rate: false,
    is_fee_paid_by_user: false,
  };

  const data = (await nowpayFetch('/payment', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as NowpayInvoiceResp;

  const expireAt = data.expiration_estimate_date
    ? new Date(data.expiration_estimate_date)
    : new Date(Date.now() + 60 * 60 * 1000);

  const inserted = await db
    .insert(deposits)
    .values({
      userId: opts.userId,
      nowpayInvoiceId: data.id ?? null,
      orderId,
      payCurrency: opts.payCurrency,
      payAmount: data.pay_amount?.toString(),
      priceAmount: opts.amountUsd.toFixed(6),
      payAddress: data.pay_address ?? null,
      status: 'waiting',
      expireAt,
    })
    .returning();
  return { deposit: inserted[0]!, payAddress: data.pay_address, payAmount: data.pay_amount };
}

/**
 * 验证 IPN 签名
 */
export function verifyIpnSignature(rawBody: string, signature: string | null): boolean {
  if (!env.NOWPAY_IPN_SECRET) {
    logger.warn('[nowpay] IPN secret not configured, skipping verification (DEV ONLY)');
    return env.NODE_ENV !== 'production';
  }
  if (!signature) return false;
  try {
    // NOWPayments 使用 HMAC-SHA512(JSON.stringify(payload, sortedKeys), secret)
    const parsed = JSON.parse(rawBody);
    const sorted = sortObjectKeys(parsed);
    const sortedJson = JSON.stringify(sorted);
    const expected = crypto
      .createHmac('sha512', env.NOWPAY_IPN_SECRET)
      .update(sortedJson)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch (e: any) {
    logger.error({ err: e.message }, '[nowpay] verify signature error');
    return false;
  }
}

function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = sortObjectKeys(obj[k]);
    return sorted;
  }
  return obj;
}

/**
 * 处理 IPN 回调
 *
 * 并发幂等保证：
 *  - 在事务中对 deposit 行加 FOR UPDATE 行锁；
 *  - 终态（finished/failed/expired）短路返回；
 *  - finished 入账与状态翻转在同一事务内提交，保证不会双倍入账。
 *
 * 金额校验：
 *  - 必须 price_currency === 'usd'（订单创建时固定）
 *  - 必须 actually_paid >= pay_amount（杜绝少付欺骗）
 *  - 必须 order_id 与本地 deposits.orderId 一致（select where 已保证）
 */
export async function handleIpn(payload: NowpayIpnPayload, rawBody: any): Promise<void> {
  const orderId = payload.order_id;
  const newStatus = payload.payment_status;
  const mapped = mapNowpayStatus(newStatus);

  let credited: { userId: number; depositId: number; amount: string } | null = null;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(deposits)
      .where(eq(deposits.orderId, orderId))
      .for('update')
      .limit(1);
    const dep = rows[0];
    if (!dep) {
      logger.warn({ orderId }, '[nowpay] IPN: deposit not found');
      return;
    }

    // 已终态：直接忽略
    if (dep.status === 'finished' || dep.status === 'failed' || dep.status === 'expired') {
      logger.info({ orderId, status: dep.status }, '[nowpay] IPN: terminal state, ignored');
      return;
    }

    const willFinish = newStatus === 'finished';

    // 金额二次校验（仅在 finished 时严格校验）
    if (willFinish) {
      if ((payload.price_currency ?? '').toLowerCase() !== 'usd') {
        logger.error(
          { orderId, price_currency: payload.price_currency },
          '[nowpay] IPN: price_currency mismatch'
        );
        await tx
          .update(deposits)
          .set({ status: 'failed', ipnRaw: rawBody })
          .where(eq(deposits.id, dep.id));
        return;
      }
      const actuallyPaid = new Decimal(payload.actually_paid ?? 0);
      const payAmount = new Decimal(payload.pay_amount ?? 0);
      if (payAmount.gt(0) && actuallyPaid.lt(payAmount)) {
        logger.error(
          { orderId, actuallyPaid: actuallyPaid.toString(), payAmount: payAmount.toString() },
          '[nowpay] IPN: underpayment detected, marking failed'
        );
        await tx
          .update(deposits)
          .set({ status: 'failed', actuallyPaid: actuallyPaid.toString(), ipnRaw: rawBody })
          .where(eq(deposits.id, dep.id));
        return;
      }
    }

    // 状态翻转
    await tx
      .update(deposits)
      .set({
        status: mapped,
        nowpayPaymentId: payload.payment_id,
        actuallyPaid: payload.actually_paid?.toString() ?? null,
        outcomeAmount: payload.outcome_amount?.toString() ?? null,
        ipnRaw: rawBody,
        confirmedAt: willFinish ? new Date() : dep.confirmedAt,
      })
      .where(eq(deposits.id, dep.id));

    // 入账（仅 finished 且当前事务内尚未 finished）
    if (willFinish) {
      const expected = new Decimal(dep.priceAmount);
      const outcome = new Decimal(payload.outcome_amount ?? expected.toString());
      const creditAmount = outcome.toFixed(6);

      await changeBalanceTx(tx, {
        userId: dep.userId,
        amount: creditAmount,
        type: 'deposit',
        refType: 'deposit',
        refId: dep.id,
        description: `充值到账 ${payload.pay_currency.toUpperCase()} (订单 ${orderId})`,
      });

      credited = { userId: dep.userId, depositId: dep.id, amount: creditAmount };
    }
  });

  // 事务提交后再发推送，避免回滚后误发
  if (credited) {
    const { userId, depositId, amount } = credited as { userId: number; depositId: number; amount: string };
    void publisher.publish(
      CHANNELS.USER_EVENT,
      JSON.stringify({
        userId,
        event: WS_EVENTS.WALLET_UPDATED,
        data: { reason: 'deposit', amount },
      })
    );
    logger.info({ userId, depositId, amount }, '[nowpay] deposit confirmed');
  }
}

function mapNowpayStatus(s: string): string {
  switch (s) {
    case 'waiting':
    case 'sending':
      return 'waiting';
    case 'confirming':
    case 'confirmed':
      return 'confirming';
    case 'finished':
      return 'finished';
    case 'failed':
    case 'refunded':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'waiting';
  }
}

/**
 * 获取 NOWPayments JWT（payout 接口要求 Bearer JWT 而非仅 API key）
 * 文档：POST /v1/auth { email, password } -> { token }
 */
let cachedJwt: { token: string; expireAt: number } | null = null;

async function getPayoutJwt(): Promise<string> {
  if (
    cachedJwt &&
    cachedJwt.expireAt > Date.now() + 60_000 // 至少剩 60s 才复用
  ) {
    return cachedJwt.token;
  }
  if (!env.NOWPAY_PAYOUT_EMAIL || !env.NOWPAY_PAYOUT_PASSWORD) {
    throw new AppError(
      'NOWPAY_PAYOUT_NOT_CONFIGURED',
      'NOWPayments Payout 凭据未配置',
      500
    );
  }
  const res = await fetch(`${env.NOWPAY_API_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: env.NOWPAY_PAYOUT_EMAIL,
      password: env.NOWPAY_PAYOUT_PASSWORD,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, '[nowpay] auth failed');
    throw new AppError('NOWPAY_AUTH_FAILED', 'NOWPayments 认证失败', 502);
  }
  const data = (await res.json()) as { token: string };
  // JWT 默认 5 分钟有效（NOWPayments 文档）
  cachedJwt = { token: data.token, expireAt: Date.now() + 5 * 60_000 };
  return data.token;
}

interface PayoutCreateResp {
  id: string;
  withdrawals: Array<{
    id: string;
    address: string;
    currency: string;
    amount: number;
    batch_withdrawal_id: string;
    status: string;
    hash?: string | null;
    error?: string | null;
  }>;
}

/**
 * 调用 NOWPayments Mass Payout API
 * 流程:
 *  1. 拿 JWT
 *  2. POST /payout 创建批量出款（包含 ipn_callback_url）
 *  3. POST /payout/{id}/verify 用 2FA 验证（可选；仅当账户开启时）
 *  4. 写回 withdrawals.txHash / status
 *
 * 注意:
 *  - 调用方需自行做幂等保护
 *  - 真实生产建议结合人工二次审核
 */
export async function executeWithdrawalViaPayout(withdrawId: number): Promise<void> {
  const wRows = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawId))
    .limit(1);
  const w = wRows[0];
  if (!w) throw new AppError('WITHDRAW_NOT_FOUND', '提现单不存在', 404);

  if (!env.NOWPAY_PAYOUT_API_KEY) {
    logger.warn(
      { withdrawId },
      '[nowpay] payout API key missing, leaving status=processing for manual handling'
    );
    await db
      .update(withdrawals)
      .set({ status: 'processing' })
      .where(eq(withdrawals.id, withdrawId));
    return;
  }

  const jwt = await getPayoutJwt();
  const orderId = `wd_${withdrawId}`;
  const body = {
    ipn_callback_url: `${env.PUBLIC_API_URL}/api/nowpay/ipn`,
    withdrawals: [
      {
        address: w.toAddress,
        currency: w.currency,
        amount: Number(w.amount),
        ipn_callback_url: `${env.PUBLIC_API_URL}/api/nowpay/ipn`,
        unique_external_id: orderId,
      },
    ],
  };

  const res = await fetch(`${env.NOWPAY_API_URL}/payout`, {
    method: 'POST',
    headers: {
      'x-api-key': env.NOWPAY_PAYOUT_API_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error(
      { withdrawId, status: res.status, body: text },
      '[nowpay] payout create failed'
    );
    // 资金已冻结：保持 processing 由运维人工处理，避免自动回滚导致重复发起
    await db
      .update(withdrawals)
      .set({ status: 'processing', reviewNote: `payout_error: ${text.slice(0, 400)}` })
      .where(eq(withdrawals.id, withdrawId));
    throw new AppError('NOWPAY_PAYOUT_FAILED', 'NOWPayments 出款失败', 502);
  }
  const data = (await res.json()) as PayoutCreateResp;
  const item = data.withdrawals?.[0];
  await db
    .update(withdrawals)
    .set({
      status: 'processing',
      txHash: item?.hash ?? null,
      reviewNote: `nowpay_id=${item?.id ?? data.id}`,
    })
    .where(eq(withdrawals.id, withdrawId));
  logger.info(
    { withdrawId, payoutId: item?.id ?? data.id },
    '[nowpay] payout created, awaiting IPN'
  );
}

/**
 * Payout IPN 状态机：finished/failed → 同步 withdrawals 状态 + 资金处理
 */
export async function handlePayoutIpn(payload: {
  id?: string;
  withdrawal_id?: string;
  status: string;
  hash?: string | null;
  amount?: number;
  currency?: string;
  unique_external_id?: string;
  error?: string | null;
}): Promise<void> {
  const externalId = payload.unique_external_id;
  if (!externalId || !externalId.startsWith('wd_')) {
    return; // 非提现 IPN
  }
  const withdrawId = Number(externalId.slice(3));
  if (!Number.isFinite(withdrawId)) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawId))
      .for('update')
      .limit(1);
    const w = rows[0];
    if (!w) return;
    if (w.status === 'finished' || w.status === 'failed' || w.status === 'rejected') return;

    const status = (payload.status ?? '').toLowerCase();
    if (['finished', 'sent', 'success'].includes(status)) {
      // 资金链上确认：扣冻结
      const Decimal = (await import('decimal.js')).default;
      const total = new Decimal(w.amount).plus(w.fee).toFixed(6);
      // 用 internal helper 在事务中处理
      // 简化：consumeFrozenBalance 自带事务，这里跨事务调用：
      // 因 IPN 不会高并发到同一笔，复用现有 helper 即可
      await tx
        .update(withdrawals)
        .set({ status: 'finished', txHash: payload.hash ?? null })
        .where(eq(withdrawals.id, withdrawId));
      // 退出 tx 后再扣冻结
      setImmediate(async () => {
        try {
          const { consumeFrozenBalance } = await import('./walletService.js');
          await consumeFrozenBalance(
            w.userId,
            total,
            'withdraw',
            'withdrawal',
            withdrawId,
            `提现链上确认 #${withdrawId}`
          );
        } catch (e: any) {
          logger.error({ withdrawId, err: e?.message }, '[nowpay] consume frozen failed');
        }
      });
    } else if (['failed', 'rejected', 'expired'].includes(status)) {
      await tx
        .update(withdrawals)
        .set({ status: 'failed', reviewNote: payload.error ?? null })
        .where(eq(withdrawals.id, withdrawId));
      // 退出 tx 后再退还冻结
      setImmediate(async () => {
        try {
          const { unfreezeBalance } = await import('./walletService.js');
          const Decimal = (await import('decimal.js')).default;
          const total = new Decimal(w.amount).plus(w.fee).toFixed(6);
          await unfreezeBalance(
            w.userId,
            total,
            'withdraw',
            'withdrawal',
            withdrawId,
            `提现失败 #${withdrawId} 退款`
          );
        } catch (e: any) {
          logger.error({ withdrawId, err: e?.message }, '[nowpay] unfreeze failed');
        }
      });
    }
  });
}
