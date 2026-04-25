import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { tradeOpenSchema, tradeListQuerySchema, SUPPORTED_SYMBOLS } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { featureGuard } from '../middleware/featureGuard.js';
import { ok, handleError } from '../middleware/errorHandler.js';
import { openTrade, listUserTrades } from '../services/tradeEngine.js';
import { getLatestTick, getLatestTicks, getKlines } from '../services/priceCache.js';
import { listRiskConfigs } from '../services/riskConfigService.js';
import { rateLimit } from '../middleware/rateLimiter.js';

const trade = new Hono();
trade.use('*', featureGuard('trade'));

// 公开行情
trade.get('/tickers', async (c) => {
  try {
    const symbols = (c.req.query('symbols')?.split(',') ?? SUPPORTED_SYMBOLS) as string[];
    const ticks = await getLatestTicks(symbols);
    return c.json(ok(ticks));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

trade.get('/ticker/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol').toLowerCase();
    const t = await getLatestTick(symbol);
    return c.json(ok(t));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

trade.get('/klines/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol').toLowerCase();
    const interval = c.req.query('interval') ?? '1min';
    const limit = Math.min(1000, Number(c.req.query('limit') ?? 500));
    const klines = await getKlines(symbol, interval, limit);
    return c.json(ok(klines));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

trade.get('/risk-configs', async (c) => {
  try {
    const items = await listRiskConfigs();
    return c.json(ok(items.filter((i) => i.enabled)));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

// 需要登录的接口
trade.use('/open', requireAuth, rateLimit({ windowSec: 1, max: 5, keyPrefix: 'rl:trade-open' }));
trade.use('/positions', requireAuth);
trade.use('/history', requireAuth);

trade.post('/open', zValidator('json', tradeOpenSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const input = c.req.valid('json');
    const t = await openTrade(userId, input);
    return c.json(ok(t));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

trade.get('/positions', async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = await listUserTrades({
      userId,
      status: 'open',
      page: 1,
      pageSize: 50,
    });
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

trade.get('/history', zValidator('query', tradeListQuerySchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const q = c.req.valid('query');
    const data = await listUserTrades({
      userId,
      status: q.status,
      page: q.page,
      pageSize: q.pageSize,
    });
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default trade;
