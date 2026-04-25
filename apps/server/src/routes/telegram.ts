import { Hono } from 'hono';
import { handleError, ok } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import {
  generateVerifyCode,
  handleTelegramUpdate,
  unbindTelegram,
  verifyWebhookSecret,
} from '../services/telegramVerifyService.js';
import { logger } from '../logger.js';

const tg = new Hono();

/**
 * 用户：申请验证码 → 客户端弹窗显示 deepLink
 */
tg.post(
  '/verify/start',
  requireAuth,
  rateLimit({ windowSec: 60, max: 5, keyPrefix: 'rl:tg:start' }),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const r = await generateVerifyCode(userId);
      return c.json(ok(r));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

/**
 * 用户：解绑
 */
tg.post('/unbind', requireAuth, async (c) => {
  try {
    const { userId } = c.get('auth');
    await unbindTelegram(userId);
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

/**
 * Telegram Bot Webhook 入口（公开端点；通过 secret token 校验）
 */
tg.post('/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (!verifyWebhookSecret(secret)) {
    logger.warn('[tg] webhook secret invalid');
    return c.json({ ok: false }, 401);
  }
  try {
    const update = await c.req.json();
    await handleTelegramUpdate(update);
    return c.json({ ok: true });
  } catch (e: any) {
    logger.error({ err: e?.message }, '[tg] webhook handler error');
    return c.json({ ok: false }, 200); // 始终 200 避免 TG 重试风暴
  }
});

export default tg;
