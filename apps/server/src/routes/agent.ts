import { Hono } from 'hono';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, commissions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { featureGuard } from '../middleware/featureGuard.js';
import { ok, handleError } from '../middleware/errorHandler.js';
import { getAgentStats } from '../services/agentService.js';

const agent = new Hono();
agent.use('*', featureGuard('agent'));
agent.use('*', requireAuth);

agent.get('/stats', async (c) => {
  try {
    const { userId } = c.get('auth');
    const stats = await getAgentStats(userId);
    return c.json(ok(stats));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

agent.get('/team', async (c) => {
  try {
    const { userId } = c.get('auth');
    // 三级团队
    const l1 = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
        balance: users.balance,
      })
      .from(users)
      .where(eq(users.parentId, userId))
      .orderBy(desc(users.createdAt));
    const l1Ids = l1.map((u) => u.id);
    const l2 =
      l1Ids.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              parentId: users.parentId,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(sql`${users.parentId} = ANY(${l1Ids})`)
        : [];
    const l2Ids = l2.map((u) => u.id);
    const l3 =
      l2Ids.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              parentId: users.parentId,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(sql`${users.parentId} = ANY(${l2Ids})`)
        : [];
    return c.json(ok({ l1, l2, l3 }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

agent.get('/commissions', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
      db
        .select({
          id: commissions.id,
          fromUserId: commissions.fromUserId,
          fromUsername: users.username,
          sourceType: commissions.sourceType,
          level: commissions.level,
          sourceAmount: commissions.sourceAmount,
          commissionAmount: commissions.commissionAmount,
          settled: commissions.settled,
          createdAt: commissions.createdAt,
        })
        .from(commissions)
        .leftJoin(users, eq(commissions.fromUserId, users.id))
        .where(eq(commissions.agentUserId, userId))
        .orderBy(desc(commissions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(commissions)
        .where(eq(commissions.agentUserId, userId)),
    ]);
    return c.json(ok({ items, total: totalRow[0]?.count ?? 0, page, pageSize }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default agent;
