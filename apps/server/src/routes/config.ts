import { Hono } from 'hono';
import { and, desc, eq, lte, gte, or, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { announcements } from '../db/schema.js';
import { getAllFeatureFlags, getConfig } from '../services/featureService.js';
import { CONFIG_KEYS, SUPPORTED_SYMBOLS, SYMBOL_DISPLAY, TRADE_DURATIONS, TRADE_DURATION_LABEL, SUPPORTED_DEPOSIT_CURRENCIES } from '@app/shared';
import { ok } from '../middleware/errorHandler.js';

const config = new Hono();

/** 公开配置：站点信息 + 功能开关 + 交易对 */
config.get('/public', async (c) => {
  const [features, siteName, siteLogo, maintenance] = await Promise.all([
    getAllFeatureFlags(),
    getConfig<string>(CONFIG_KEYS.SITE_NAME, '加密期权 & 盲盒平台'),
    getConfig<string>(CONFIG_KEYS.SITE_LOGO, '/logo.svg'),
    getConfig<boolean>(CONFIG_KEYS.SITE_MAINTENANCE_MODE, false),
  ]);

  return c.json(
    ok({
      site: {
        name: siteName,
        logo: siteLogo,
        maintenance,
      },
      features,
      symbols: SUPPORTED_SYMBOLS.map((s) => ({ code: s, ...SYMBOL_DISPLAY[s] })),
      durations: TRADE_DURATIONS.map((d) => ({ value: d, label: TRADE_DURATION_LABEL[d] })),
      depositCurrencies: SUPPORTED_DEPOSIT_CURRENCIES,
    })
  );
});

/** 仅功能开关 */
config.get('/features', async (c) => {
  const flags = await getAllFeatureFlags();
  return c.json(ok(flags));
});

/** 公开公告（生效中的，按优先级降序） */
config.get('/announcements', async (c) => {
  const now = new Date();
  const items = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.isActive, true),
        or(isNull(announcements.startAt), lte(announcements.startAt, now)),
        or(isNull(announcements.endAt), gte(announcements.endAt, now))
      )
    )
    .orderBy(desc(announcements.priority), desc(announcements.id))
    .limit(20);
  return c.json(ok({ items }));
});

export default config;
