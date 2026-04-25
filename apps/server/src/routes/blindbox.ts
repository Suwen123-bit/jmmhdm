import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { blindboxOpenSchema, blindboxExchangeSchema } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { featureGuard } from '../middleware/featureGuard.js';
import { ok, handleError } from '../middleware/errorHandler.js';
import {
  listBlindboxes,
  getBlindboxDetail,
  openBlindbox,
  exchangeInventory,
  getUserInventory,
  getUserBlindboxRecords,
} from '../services/blindboxEngine.js';
import { rateLimit } from '../middleware/rateLimiter.js';

const blindbox = new Hono();
blindbox.use('*', featureGuard('blindbox'));

blindbox.get('/list', async (c) => {
  try {
    const items = await listBlindboxes();
    return c.json(ok({ items }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

blindbox.get('/detail/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await getBlindboxDetail(id);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

blindbox.post(
  '/open',
  requireAuth,
  rateLimit({ windowSec: 1, max: 3, keyPrefix: 'rl:bb-open' }),
  zValidator('json', blindboxOpenSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { blindboxId, count } = c.req.valid('json');
      const results = await openBlindbox(userId, blindboxId, count);
      return c.json(ok({ results }));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

blindbox.post(
  '/exchange',
  requireAuth,
  zValidator('json', blindboxExchangeSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const { inventoryIds } = c.req.valid('json');
      const result = await exchangeInventory(userId, inventoryIds);
      return c.json(ok(result));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

blindbox.get('/inventory', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const data = await getUserInventory(userId, page, pageSize);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

blindbox.get('/records', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const data = await getUserBlindboxRecords(userId, page, pageSize);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default blindbox;
