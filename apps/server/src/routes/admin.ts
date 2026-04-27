import { Hono } from 'hono';
import { eq, desc, sql, and, gte, like, or, inArray } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import {
  users,
  trades,
  blindboxes,
  blindboxItems,
  blindboxProducts,
  walletLogs,
  deposits,
  withdrawals,
  systemConfig,
  tradeRiskConfig,
  commissions,
  agents,
  adminLogs,
  tickets,
  ipBlacklist,
  geoBlocks,
  kycApplications,
} from '../db/schema.js';
import { db } from '../db/client.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ok, handleError, AppError } from '../middleware/errorHandler.js';
import { setConfig, getConfigBatch, ensureDefaultConfigs } from '../services/featureService.js';
import { setRiskConfig, listRiskConfigs } from '../services/riskConfigService.js';
import { approveWithdrawal, rejectWithdrawal } from '../services/withdrawService.js';
import { changeBalance } from '../services/walletService.js';
import {
  adminListTickets,
  getTicketDetail,
  replyTicket,
  updateTicketStatus,
} from '../services/ticketService.js';
import {
  adminUpdateUserSchema,
  adminConfigUpdateSchema as configSetSchema,
  adminRiskConfigUpsertSchema as riskConfigSchema,
  adminBlindboxUpsertSchema as blindboxCreateSchema,
  adminBlindboxItemSchema as blindboxItemSchema,
  adminBlindboxProductUpsertSchema as blindboxProductSchema,
  adminKycReviewSchema,
  ipBlacklistUpsertSchema,
  geoBlockUpsertSchema,
  announcementUpsertSchema,
} from '@app/shared';
import { announcements, userAgreements } from '../db/schema.js';
import { listKycApplications, reviewKyc } from '../services/kycService.js';
import { invalidateAntifraudCache } from '../middleware/antifraud.js';
import { getAnomalySummary, listAnomalies, resolveAnomaly } from '../services/anomalyService.js';
import { exportCsv } from '../services/reportService.js';
import { logger } from '../logger.js';

const admin = new Hono();
admin.use('*', requireAuth, requireAdmin);

async function audit(adminId: number, action: string, targetType: string, targetId: string | number | null, before: any, after: any, c: any) {
  const [module] = action.split('.');
  await db.insert(adminLogs).values({
    adminId,
    module: module ?? 'misc',
    action,
    targetType,
    targetId: targetId !== null ? String(targetId) : null,
    detailJson: { before, after },
    ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? null,
  });
}

// ============== 仪表盘 ==============
admin.get('/dashboard', async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [userTotal, userToday, depositToday, withdrawToday, tradeToday, tradeOpen, blindBoxSold] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, today)),
      db
        .select({ sum: sql<string>`COALESCE(SUM(${deposits.priceAmount}), 0)::text` })
        .from(deposits)
        .where(and(gte(deposits.createdAt, today), eq(deposits.status, 'finished'))),
      db
        .select({ sum: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text` })
        .from(withdrawals)
        .where(and(gte(withdrawals.createdAt, today), eq(withdrawals.status, 'finished'))),
      db
        .select({
          count: sql<number>`count(*)::int`,
          sum: sql<string>`COALESCE(SUM(${trades.amount}), 0)::text`,
          profit: sql<string>`COALESCE(SUM(${trades.profit}), 0)::text`,
        })
        .from(trades)
        .where(gte(trades.createdAt, today)),
      db.select({ count: sql<number>`count(*)::int` }).from(trades).where(eq(trades.status, 'open')),
      db
        .select({ sum: sql<string>`COALESCE(SUM(${blindboxes.soldCount}), 0)::int` })
        .from(blindboxes),
    ]);
    // 近 7 日趋势聚合（按天）
    const sevenAgo = new Date(today);
    sevenAgo.setDate(sevenAgo.getDate() - 6);
    const sevenAgoIso = sevenAgo.toISOString();
    const [depRows, wdRows, trRows] = await Promise.all([
      db.execute(sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(price_amount), 0)::text AS amount
        FROM ${deposits}
        WHERE created_at >= ${sevenAgoIso}::timestamptz AND status = 'finished'
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(amount), 0)::text AS amount
        FROM ${withdrawals}
        WHERE created_at >= ${sevenAgoIso}::timestamptz AND status = 'finished'
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(amount), 0)::text AS amount
        FROM ${trades}
        WHERE created_at >= ${sevenAgoIso}::timestamptz
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    // 把零散结果按日期对齐成定长 7 天数组
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenAgo);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const depMap = new Map(
      (depRows as any).map((r: any) => [r.day, Number(r.amount)])
    );
    const wdMap = new Map(
      (wdRows as any).map((r: any) => [r.day, Number(r.amount)])
    );
    const trMap = new Map(
      (trRows as any).map((r: any) => [r.day, Number(r.amount)])
    );
    const trends = {
      dates,
      deposit: dates.map((d) => depMap.get(d) ?? 0),
      withdraw: dates.map((d) => wdMap.get(d) ?? 0),
      tradeVolume: dates.map((d) => trMap.get(d) ?? 0),
    };

    return c.json(
      ok({
        users: { total: userTotal[0]?.count ?? 0, today: userToday[0]?.count ?? 0 },
        deposit: { today: depositToday[0]?.sum ?? '0' },
        withdraw: { today: withdrawToday[0]?.sum ?? '0' },
        trade: {
          todayCount: tradeToday[0]?.count ?? 0,
          todayVolume: tradeToday[0]?.sum ?? '0',
          todayPnL: tradeToday[0]?.profit ?? '0',
          open: tradeOpen[0]?.count ?? 0,
        },
        blindbox: { totalSold: blindBoxSold[0]?.sum ?? 0 },
        trends,
      })
    );
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 用户管理 ==============
admin.get('/users', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const search = c.req.query('search')?.trim();
    const status = c.req.query('status')?.trim();
    const offset = (page - 1) * pageSize;
    const where = and(
      search
        ? or(like(users.username, `%${search}%`), like(users.email, `%${search}%`))
        : undefined,
      status ? eq(users.status, status) : undefined
    );
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          balance: users.balance,
          frozenBalance: users.frozenBalance,
          status: users.status,
          role: users.role,
          parentId: users.parentId,
          inviteCode: users.inviteCode,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(where ?? sql`true`),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 手动调整余额（充值/扣款）—— 必须放在 :id 动态路由之前，否则会被 :id 吃掉
const adjustSchema = z.object({
  userId: z.number().int().positive(),
  amount: z.number(), // 正负
  reason: z.string().min(1).max(200),
});
admin.post('/users/adjust-balance', zValidator('json', adjustSchema), async (c) => {
  try {
    const { userId, amount, reason } = c.req.valid('json');
    const adminId = c.get('auth').userId;
    await changeBalance({
      userId,
      amount,
      type: 'admin_adjust',
      refType: 'admin',
      refId: adminId,
      description: `[管理员调整] ${reason}`,
    });
    await audit(adminId, 'user.adjust_balance', 'user', userId, null, { amount, reason }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/users/:id{[0-9]+}', zValidator('json', adminUpdateUserSchema), async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('INVALID_ID', '无效的用户 ID', 400);
    }
    const data = c.req.valid('json');
    const before = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
    const set: any = { updatedAt: new Date() };
    if (data.status) set.status = data.status;
    if (data.role) set.role = data.role;
    if (data.email) set.email = data.email;
    if (data.password) set.passwordHash = await bcrypt.hash(data.password, 10);
    await db.update(users).set(set).where(eq(users.id, id));
    const after = await db.select().from(users).where(eq(users.id, id)).limit(1);
    await audit(c.get('auth').userId, 'user.update', 'user', id, before[0], after[0], c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 系统配置 / 功能开关 ==============
admin.get('/configs', async (c) => {
  try {
    const rows = await db.select().from(systemConfig).orderBy(systemConfig.key);
    return c.json(ok({ items: rows }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/configs/set', zValidator('json', configSetSchema), async (c) => {
  try {
    const { key, value } = c.req.valid('json');
    const adminId = c.get('auth').userId;
    await setConfig(key, value, adminId);
    await audit(adminId, 'config.set', 'config', key, null, { value }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/configs/init-defaults', async (c) => {
  try {
    await ensureDefaultConfigs();
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 风控配置 ==============
admin.get('/risk-configs', async (c) => {
  try {
    const items = await listRiskConfigs();
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/risk-configs/set', zValidator('json', riskConfigSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const adminId = c.get('auth').userId;
    await setRiskConfig(data, adminId);
    await audit(adminId, 'risk.set', 'risk_config', `${data.symbol}:${data.duration}`, null, data, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 交易订单监控 ==============
admin.get('/trades', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const status = c.req.query('status')?.trim();
    const userId = c.req.query('userId') ? Number(c.req.query('userId')) : undefined;
    const offset = (page - 1) * pageSize;
    const where = and(
      status ? eq(trades.status, status) : undefined,
      userId ? eq(trades.userId, userId) : undefined
    );
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: trades.id,
          userId: trades.userId,
          username: users.username,
          symbol: trades.symbol,
          direction: trades.direction,
          amount: trades.amount,
          duration: trades.duration,
          entryPrice: trades.entryPrice,
          exitPrice: trades.exitPrice,
          payoutRate: trades.payoutRate,
          status: trades.status,
          result: trades.result,
          profit: trades.profit,
          createdAt: trades.createdAt,
          settleAt: trades.settleAt,
          settledAt: trades.settledAt,
        })
        .from(trades)
        .leftJoin(users, eq(trades.userId, users.id))
        .where(where)
        .orderBy(desc(trades.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(trades).where(where ?? sql`true`),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 财务: 提现审核 ==============
admin.get('/withdrawals', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const status = c.req.query('status')?.trim();
    const offset = (page - 1) * pageSize;
    const where = status ? eq(withdrawals.status, status) : undefined;
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: withdrawals.id,
          userId: withdrawals.userId,
          username: users.username,
          currency: withdrawals.currency,
          network: withdrawals.network,
          toAddress: withdrawals.toAddress,
          amount: withdrawals.amount,
          fee: withdrawals.fee,
          status: withdrawals.status,
          riskScore: withdrawals.riskScore,
          createdAt: withdrawals.createdAt,
          reviewedAt: withdrawals.reviewedAt,
        })
        .from(withdrawals)
        .leftJoin(users, eq(withdrawals.userId, users.id))
        .where(where)
        .orderBy(desc(withdrawals.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(withdrawals).where(where ?? sql`true`),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/withdrawals/:id/approve', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const note = (await c.req.json()).note as string | undefined;
    const adminId = c.get('auth').userId;
    await approveWithdrawal(id, adminId, note);
    await audit(adminId, 'withdraw.approve', 'withdrawal', id, null, { note }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/withdrawals/:id/reject', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const note = body.note as string;
    if (!note) throw new AppError('NOTE_REQUIRED', '请填写拒绝理由', 400);
    const adminId = c.get('auth').userId;
    await rejectWithdrawal(id, adminId, note);
    await audit(adminId, 'withdraw.reject', 'withdrawal', id, null, { note }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 充值列表
admin.get('/deposits', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const status = c.req.query('status')?.trim();
    const offset = (page - 1) * pageSize;
    const where = status ? eq(deposits.status, status) : undefined;
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: deposits.id,
          userId: deposits.userId,
          username: users.username,
          orderId: deposits.orderId,
          payCurrency: deposits.payCurrency,
          payAmount: deposits.payAmount,
          priceAmount: deposits.priceAmount,
          actuallyPaid: deposits.actuallyPaid,
          status: deposits.status,
          createdAt: deposits.createdAt,
          confirmedAt: deposits.confirmedAt,
        })
        .from(deposits)
        .leftJoin(users, eq(deposits.userId, users.id))
        .where(where)
        .orderBy(desc(deposits.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(deposits).where(where ?? sql`true`),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 盲盒管理 ==============
admin.get('/blindboxes', async (c) => {
  try {
    const items = await db.select().from(blindboxes).orderBy(desc(blindboxes.createdAt));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/blindboxes/upsert', zValidator('json', blindboxCreateSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    if (data.id) {
      await db
        .update(blindboxes)
        .set({ ...(data as any), updatedAt: new Date() })
        .where(eq(blindboxes.id, data.id));
      return c.json(ok({ id: data.id }));
    }
    const inserted = await db.insert(blindboxes).values(data as any).returning();
    return c.json(ok({ id: inserted[0]!.id }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/blindboxes/:id/items', zValidator('json', z.array(blindboxItemSchema)), async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const items = c.req.valid('json');
    await db.transaction(async (tx) => {
      await tx.delete(blindboxItems).where(eq(blindboxItems.blindboxId, id));
      for (const it of items) {
        await tx.insert(blindboxItems).values({
          blindboxId: id,
          productId: it.productId,
          probability: String(it.probability),
          stock: it.stock,
          initialStock: it.initialStock ?? it.stock,
        });
      }
    });
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.get('/blindbox-products', async (c) => {
  try {
    const items = await db.select().from(blindboxProducts).orderBy(desc(blindboxProducts.id));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/blindbox-products/upsert', zValidator('json', blindboxProductSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    if (data.id) {
      await db
        .update(blindboxProducts)
        .set({ ...(data as any), value: String(data.value), updatedAt: new Date() })
        .where(eq(blindboxProducts.id, data.id));
      return c.json(ok({ id: data.id }));
    }
    const inserted = await db
      .insert(blindboxProducts)
      .values({ ...(data as any), value: String(data.value) })
      .returning();
    return c.json(ok({ id: inserted[0]!.id }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 代理 ==============
admin.get('/agents', async (c) => {
  try {
    const items = await db
      .select({
        userId: agents.userId,
        username: users.username,
        parentId: agents.parentId,
        l1Rate: agents.l1Rate,
        l2Rate: agents.l2Rate,
        l3Rate: agents.l3Rate,
        totalCommission: agents.totalCommission,
        level: agents.level,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .leftJoin(users, eq(agents.userId, users.id))
      .orderBy(desc(agents.totalCommission));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

const agentRateSchema = z.object({
  userId: z.number().int().positive(),
  l1Rate: z.number().min(0).max(1),
  l2Rate: z.number().min(0).max(1),
  l3Rate: z.number().min(0).max(1),
});
admin.post('/agents/rate', zValidator('json', agentRateSchema), async (c) => {
  try {
    const { userId, l1Rate, l2Rate, l3Rate } = c.req.valid('json');
    await db
      .insert(agents)
      .values({
        userId,
        parentId: null,
        l1Rate: l1Rate.toFixed(4),
        l2Rate: l2Rate.toFixed(4),
        l3Rate: l3Rate.toFixed(4),
      })
      .onConflictDoUpdate({
        target: agents.userId,
        set: {
          l1Rate: l1Rate.toFixed(4),
          l2Rate: l2Rate.toFixed(4),
          l3Rate: l3Rate.toFixed(4),
        },
      });
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 工单 ==============
admin.get('/tickets', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const status = c.req.query('status') as any;
    const data = await adminListTickets({ status, page, pageSize });
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.get('/tickets/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await getTicketDetail(id, undefined, true);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/tickets/:id/reply', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const adminId = c.get('auth').userId;
    const body = await c.req.json();
    await replyTicket({
      ticketId: id,
      senderType: 'admin',
      senderId: adminId,
      content: body.content,
      attachments: body.attachments,
    });
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/tickets/:id/status', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const adminId = c.get('auth').userId;
    const body = await c.req.json();
    await updateTicketStatus(id, body.status, adminId);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== KYC 审核 ==============
admin.get('/kyc', async (c) => {
  try {
    const status = c.req.query('status') ?? undefined;
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const data = await listKycApplications({ status, page, pageSize });
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/kyc/review', zValidator('json', adminKycReviewSchema), async (c) => {
  try {
    const { applicationId, action, note } = c.req.valid('json');
    const adminId = c.get('auth').userId;
    const r = await reviewKyc({ applicationId, reviewerId: adminId, action, note });
    await audit(adminId, `kyc.${action}`, 'kyc', applicationId, null, { note }, c);
    return c.json(ok(r));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== IP 黑名单 ==============
admin.get('/ip-blacklist', async (c) => {
  try {
    const items = await db
      .select()
      .from(ipBlacklist)
      .orderBy(desc(ipBlacklist.createdAt))
      .limit(500);
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/ip-blacklist', zValidator('json', ipBlacklistUpsertSchema), async (c) => {
  try {
    const { ipOrCidr, reason } = c.req.valid('json');
    const adminId = c.get('auth').userId;
    await db
      .insert(ipBlacklist)
      .values({ ipOrCidr, reason, createdBy: adminId })
      .onConflictDoUpdate({
        target: ipBlacklist.ipOrCidr,
        set: { reason },
      });
    await invalidateAntifraudCache();
    await audit(adminId, 'ip_blacklist.upsert', 'ip', ipOrCidr, null, { reason }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.delete('/ip-blacklist/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError('INVALID_ID', 'ID 无效', 400);
    await db.delete(ipBlacklist).where(eq(ipBlacklist.id, id));
    await invalidateAntifraudCache();
    await audit(c.get('auth').userId, 'ip_blacklist.delete', 'ip', id, null, null, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 地域封禁 ==============
admin.get('/geo-blocks', async (c) => {
  try {
    const items = await db.select().from(geoBlocks).orderBy(geoBlocks.countryCode);
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post('/geo-blocks', zValidator('json', geoBlockUpsertSchema), async (c) => {
  try {
    const { countryCode, countryName, enabled } = c.req.valid('json');
    const adminId = c.get('auth').userId;
    await db
      .insert(geoBlocks)
      .values({ countryCode, countryName, enabled, updatedBy: adminId })
      .onConflictDoUpdate({
        target: geoBlocks.countryCode,
        set: { countryName, enabled, updatedBy: adminId, updatedAt: new Date() },
      });
    await invalidateAntifraudCache();
    await audit(adminId, 'geo_blocks.upsert', 'geo', countryCode, null, { countryName, enabled }, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.delete('/geo-blocks/:code', async (c) => {
  try {
    const code = c.req.param('code')?.toUpperCase();
    if (!code) throw new AppError('INVALID_CODE', '国家码无效', 400);
    await db.delete(geoBlocks).where(eq(geoBlocks.countryCode, code));
    await invalidateAntifraudCache();
    await audit(c.get('auth').userId, 'geo_blocks.delete', 'geo', code, null, null, c);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 审计日志 ==============
admin.get('/audit-logs', async (c) => {
  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 50)));
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: adminLogs.id,
          adminId: adminLogs.adminId,
          adminName: users.username,
          module: adminLogs.module,
          action: adminLogs.action,
          targetType: adminLogs.targetType,
          targetId: adminLogs.targetId,
          detail: adminLogs.detailJson,
          ip: adminLogs.ip,
          createdAt: adminLogs.createdAt,
        })
        .from(adminLogs)
        .leftJoin(users, eq(adminLogs.adminId, users.id))
        .orderBy(desc(adminLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(adminLogs),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== 公告 CRUD ==============
admin.get('/announcements', async (c) => {
  try {
    const items = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.priority), desc(announcements.id));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post(
  '/announcements/upsert',
  zValidator('json', announcementUpsertSchema),
  async (c) => {
    try {
      const adminUser = c.get('auth');
      const data = c.req.valid('json');
      const values = {
        title: data.title,
        content: data.content,
        type: data.type,
        priority: data.priority,
        isActive: data.isActive,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        createdBy: adminUser.userId,
      };
      let id = data.id;
      if (id) {
        await db.update(announcements).set(values).where(eq(announcements.id, id));
      } else {
        const r = await db.insert(announcements).values(values).returning({ id: announcements.id });
        id = r[0]!.id;
      }
      await audit(adminUser.userId, 'announcement.upsert', 'announcement', id, null, values, c);
      return c.json(ok({ id }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

admin.post(
  '/announcements/delete',
  zValidator('json', z.object({ id: z.number().int().positive() })),
  async (c) => {
    try {
      const adminUser = c.get('auth');
      const { id } = c.req.valid('json');
      await db.delete(announcements).where(eq(announcements.id, id));
      await audit(adminUser.userId, 'announcement.delete', 'announcement', id, null, null, c);
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// ============== 协议版本管理 ==============
const agreementVersionSchema = z.object({
  agreementType: z.enum(['terms', 'privacy', 'risk']),
  version: z.string().min(1).max(16),
  content: z.string().min(10).max(50000),
});

/**
 * 协议存储策略：使用 system_config，key=agreement.<type>.<version>
 * 当前生效版本：agreement.<type>.current → version
 */
admin.get('/agreements', async (c) => {
  try {
    const types = ['terms', 'privacy', 'risk'] as const;
    const out: Record<string, { current: string | null; versions: Array<{ version: string; updatedAt: string }> }> = {};
    for (const t of types) {
      const rows = await db
        .select()
        .from(systemConfig)
        .where(like(systemConfig.key, `agreement.${t}.%`));
      const current = rows.find((r) => r.key === `agreement.${t}.current`)?.value as string | null;
      const versions = rows
        .filter((r) => r.key !== `agreement.${t}.current`)
        .map((r) => ({
          version: r.key.replace(`agreement.${t}.`, ''),
          updatedAt: r.updatedAt.toISOString(),
        }));
      out[t] = { current: current ?? null, versions };
    }
    return c.json(ok(out));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.get('/agreements/content', async (c) => {
  try {
    const type = c.req.query('type') ?? '';
    const version = c.req.query('version') ?? '';
    if (!['terms', 'privacy', 'risk'].includes(type) || !version) {
      throw new AppError('INVALID_PARAMS', 'type/version 不合法', 400);
    }
    const row = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, `agreement.${type}.${version}`))
      .limit(1);
    return c.json(ok({ content: (row[0]?.value as string) ?? '' }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post(
  '/agreements/upsert',
  zValidator('json', agreementVersionSchema),
  async (c) => {
    try {
      const adminUser = c.get('auth');
      const { agreementType, version, content } = c.req.valid('json');
      await setConfig(`agreement.${agreementType}.${version}`, content, adminUser.userId);
      await audit(
        adminUser.userId,
        'agreement.upsert',
        'agreement',
        `${agreementType}@${version}`,
        null,
        { length: content.length },
        c
      );
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

admin.post(
  '/agreements/publish',
  zValidator(
    'json',
    z.object({
      agreementType: z.enum(['terms', 'privacy', 'risk']),
      version: z.string().min(1).max(16),
    })
  ),
  async (c) => {
    try {
      const adminUser = c.get('auth');
      const { agreementType, version } = c.req.valid('json');
      // 必须先存在该版本
      const exists = await db
        .select({ key: systemConfig.key })
        .from(systemConfig)
        .where(eq(systemConfig.key, `agreement.${agreementType}.${version}`))
        .limit(1);
      if (!exists[0]) throw new AppError('VERSION_NOT_FOUND', '该版本不存在', 404);
      await setConfig(`agreement.${agreementType}.current`, version, adminUser.userId);
      await audit(
        adminUser.userId,
        'agreement.publish',
        'agreement',
        agreementType,
        null,
        { version },
        c
      );
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

admin.get('/agreements/acceptance/:userId', async (c) => {
  try {
    const userId = Number(c.req.param('userId'));
    const items = await db
      .select()
      .from(userAgreements)
      .where(eq(userAgreements.userId, userId))
      .orderBy(desc(userAgreements.agreedAt));
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// ============== AI 风控监控 ==============
admin.get('/ai-monitor/summary', async (c) => {
  try {
    const s = await getAnomalySummary();
    return c.json(ok(s));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.get('/ai-monitor/anomalies', async (c) => {
  try {
    const resolved = c.req.query('resolved');
    const r = await listAnomalies({
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      category: c.req.query('category') || undefined,
      severity: c.req.query('severity') || undefined,
      page: Number(c.req.query('page') ?? 1),
      pageSize: Number(c.req.query('pageSize') ?? 50),
    });
    return c.json(ok(r));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

admin.post(
  '/ai-monitor/resolve',
  zValidator('json', z.object({ id: z.number().int().positive() })),
  async (c) => {
    try {
      const { id } = c.req.valid('json');
      const adminUser = c.get('auth');
      await resolveAnomaly(id, adminUser.userId);
      await audit(adminUser.userId, 'ai_monitor.resolve', 'ai_anomaly', id, null, null, c);
      return c.json(ok({ success: true }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

// ============== 数据报表 CSV 导出 ==============
admin.get('/reports/export', async (c) => {
  try {
    const type = c.req.query('type') ?? '';
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const allowed = ['deposits', 'withdrawals', 'trades', 'commissions', 'users', 'audit_logs'];
    if (!allowed.includes(type)) {
      throw new AppError('INVALID_TYPE', '不支持的报表类型', 400);
    }
    if (!startDate || !endDate) {
      throw new AppError('MISSING_DATE', '请提供 startDate 和 endDate', 400);
    }
    const adminUser = c.get('auth');
    const csv = await exportCsv({
      type: type as any,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
    await audit(
      adminUser.userId,
      'report.export',
      'report',
      type,
      null,
      { startDate, endDate, bytes: csv.length },
      c
    );
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="${type}_${startDate.slice(0, 10)}_${endDate.slice(0, 10)}.csv"`
    );
    return c.body(csv);
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default admin;
