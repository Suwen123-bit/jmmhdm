import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { depositCreateSchema, withdrawCreateSchema } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { ok, handleError } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { db } from '../db/client.js';
import { deposits, withdrawals } from '../db/schema.js';
import { createDeposit } from '../services/nowpayService.js';
import { createWithdrawal } from '../services/withdrawService.js';
import { getBalance, changeBalance } from '../services/walletService.js';
import { env } from '../config/env.js';
import { z } from 'zod';

const wallet = new Hono();
wallet.use('*', requireAuth);

wallet.get('/balance', async (c) => {
  try {
    const { userId } = c.get('auth');
    const b = await getBalance(userId);
    return c.json(ok(b));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

wallet.post(
  '/deposit',
  rateLimit({ windowSec: 60, max: 5, keyPrefix: 'rl:deposit' }),
  zValidator('json', depositCreateSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { amountUsd, payCurrency } = c.req.valid('json');
      const data = await createDeposit({ userId, amountUsd, payCurrency });
      return c.json(ok(data));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

wallet.get('/deposits', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(deposits)
        .where(eq(deposits.userId, userId))
        .orderBy(desc(deposits.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deposits)
        .where(eq(deposits.userId, userId)),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

wallet.post(
  '/withdraw',
  rateLimit({ windowSec: 60, max: 3, keyPrefix: 'rl:withdraw' }),
  zValidator('json', withdrawCreateSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const data = c.req.valid('json');
      const w = await createWithdrawal({ userId, ...data });
      return c.json(ok(w));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

wallet.get('/withdrawals', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.userId, userId))
        .orderBy(desc(withdrawals.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(withdrawals)
        .where(eq(withdrawals.userId, userId)),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== Dev Only: 模拟充值（仅 NODE_ENV=development）==============
const devDepositSchema = z.object({
  amount: z.number().positive().max(1_000_000),
});

wallet.post('/dev-deposit', zValidator('json', devDepositSchema), async (c) => {
  if (env.NODE_ENV !== 'development') {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
  }
  try {
    const { userId } = c.get('auth');
    const { amount } = c.req.valid('json');
    const r = await changeBalance({
      userId,
      amount,
      type: 'admin_adjust',
      refType: 'dev_deposit',
      description: `[DEV] mock deposit +${amount} USDT`,
    });
    return c.json(ok({ balanceAfter: r.balanceAfter }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default wallet;
