import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userTelegram } from '../db/schema.js';
import { redis } from '../redis.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

/**
 * Telegram 双向验证流程
 *
 *  1) 用户在 Profile 点击"绑定 Telegram"
 *     → 后端生成一次性 8 位代码 → 存 Redis 5min（key: tg:verify:<code> = userId）
 *     → 返回 { code, deepLink: 'https://t.me/<bot>?start=verify_<code>' }
 *  2) 用户点击 deep link 进入 bot 会话，发送 /start verify_<code>
 *     → bot webhook 触发 handleTelegramUpdate(update)：
 *        - 解析出 code → 在 Redis 取 userId → 写 user_telegram(userId, chatId, verified=true)
 *        - bot 回复 "✅ 绑定成功"
 *  3) 后续 sendTelegram() 检查 verified=true 才发送
 *
 * 部署：在 BotFather 申请 webhook，URL 设为 https://api.example.com/api/telegram/webhook
 */

const VERIFY_PREFIX = 'tg:verify:';
const VERIFY_TTL = 300; // 5min

export async function generateVerifyCode(userId: number): Promise<{ code: string; deepLink: string | null }> {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  await redis.setex(VERIFY_PREFIX + code, VERIFY_TTL, String(userId));
  let botUsername: string | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
      const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
      if (j.ok) botUsername = j.result?.username ?? null;
    } catch (e: any) {
      logger.warn({ err: e?.message }, '[tg-verify] getMe failed');
    }
  }
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=verify_${code}` : null;
  return { code, deepLink };
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string };
    text?: string;
  };
}

/**
 * 处理 Telegram 更新（webhook 入口）
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  // /start verify_XXXX
  const m = msg.text.match(/^\/start\s+verify_([A-Z0-9]{6,16})/);
  if (!m) {
    await sendBotMessage(msg.chat.id, '欢迎使用 Crypto Platform Bot！请通过网页设置内的"绑定 Telegram"按钮发起验证。');
    return;
  }
  const code = m[1];
  const userIdStr = await redis.get(VERIFY_PREFIX + code);
  if (!userIdStr) {
    await sendBotMessage(msg.chat.id, '⚠️ 验证码已失效，请回到网页重新发起绑定。');
    return;
  }
  const userId = Number(userIdStr);
  await db
    .insert(userTelegram)
    .values({ userId, telegramChatId: String(msg.chat.id), verified: true })
    .onConflictDoUpdate({
      target: userTelegram.userId,
      set: { telegramChatId: String(msg.chat.id), verified: true },
    });
  await redis.del(VERIFY_PREFIX + code);
  await sendBotMessage(msg.chat.id, '✅ 已成功绑定，您将收到平台通知。');
  logger.info({ userId, chatId: msg.chat.id }, '[tg-verify] user verified');
}

async function sendBotMessage(chatId: number, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}

/**
 * 解绑：清空 user_telegram 行，且 invalidate 当前 chatId
 */
export async function unbindTelegram(userId: number): Promise<void> {
  await db.delete(userTelegram).where(eq(userTelegram.userId, userId));
}

/**
 * 校验 webhook secret token（X-Telegram-Bot-Api-Secret-Token）
 */
export function verifyWebhookSecret(headerValue: string | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // 未配置则跳过（dev only）
  return headerValue === expected;
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  // 显式声明用于消除 unused 错误（运行时无影响）
  void AppError;
}
