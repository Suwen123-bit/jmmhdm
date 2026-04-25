import { eq } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import webpush from 'web-push';
import { db } from '../db/client.js';
import { users, userTelegram, webPushSubscriptions } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

let mailer: Transporter | null = null;
let webpushReady = false;

function getMailer(): Transporter | null {
  if (mailer) return mailer;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    return null;
  }
  mailer = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return mailer;
}

function ensureWebpush(): boolean {
  if (webpushReady) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  webpushReady = true;
  return true;
}

/**
 * 发送邮件（默认收件人 = 用户主邮箱）
 *
 * 两种用法：
 *   1) sendEmail({ userId, subject, html }) — 直接传文本
 *   2) sendEmail({ userId, templateKey, vars }) — 按用户 language 渲染 i18n 模板
 */
export async function sendEmail(opts: {
  userId: number;
  subject?: string;
  html?: string;
  text?: string;
  templateKey?: import('./emailTemplates.js').EmailTemplateKey;
  vars?: Record<string, any>;
}): Promise<void> {
  const m = getMailer();
  if (!m) {
    logger.warn({ userId: opts.userId }, '[notify:email] SMTP not configured, skipping');
    return;
  }
  const u = await db
    .select({ email: users.email, language: users.language })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!u[0]?.email) return;

  let subject = opts.subject;
  let html = opts.html;
  if (opts.templateKey) {
    const { renderEmail } = await import('./emailTemplates.js');
    const r = renderEmail(opts.templateKey, u[0].language, opts.vars ?? {});
    subject = subject ?? r.subject;
    html = html ?? r.html;
  }
  if (!subject || !html) {
    logger.warn({ userId: opts.userId }, '[notify:email] missing subject/html');
    return;
  }
  await m.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: u[0].email,
    subject,
    html,
    text: opts.text ?? html.replace(/<[^>]+>/g, ''),
  });
}

/**
 * Telegram 投递：bot sendMessage
 */
export async function sendTelegram(opts: {
  userId: number;
  text: string;
}): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn({ userId: opts.userId }, '[notify:telegram] bot token missing');
    return;
  }
  const tg = await db
    .select({ chatId: userTelegram.telegramChatId, verified: userTelegram.verified })
    .from(userTelegram)
    .where(eq(userTelegram.userId, opts.userId))
    .limit(1);
  if (!tg[0] || !tg[0].verified) return;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: tg[0].chatId,
      text: opts.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ userId: opts.userId, status: res.status, body }, '[notify:telegram] send failed');
  }
}

/**
 * WebPush 推送：向该用户所有订阅端点逐个发送，失效订阅自动清理
 */
export async function sendWebPush(opts: {
  userId: number;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  if (!ensureWebpush()) {
    logger.warn({ userId: opts.userId }, '[notify:webpush] VAPID not configured');
    return;
  }
  const subs = await db
    .select()
    .from(webPushSubscriptions)
    .where(eq(webPushSubscriptions.userId, opts.userId));
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    url: opts.url ?? '/',
  });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.authKey },
          },
          payload
        );
      } catch (err: any) {
        // 410/404 表示订阅已失效，删除
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await db
            .delete(webPushSubscriptions)
            .where(eq(webPushSubscriptions.id, s.id));
        } else {
          logger.error(
            { userId: opts.userId, status: err?.statusCode, msg: err?.message },
            '[notify:webpush] send error'
          );
        }
      }
    })
  );
}

/**
 * 运维通知（推到统一的运维 Telegram 群）
 *
 * 支持：
 *   - notifyOps('plain text') — 简单字符串
 *   - notifyOps({ title, content, level }) — 结构化告警，加上严重度 emoji
 */
export interface OpsAlert {
  title: string;
  content: string;
  level?: 'info' | 'warning' | 'critical';
}

const LEVEL_EMOJI: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
};

export async function notifyOps(payload: string | OpsAlert): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_OPS_CHAT_ID) return;
  let text: string;
  if (typeof payload === 'string') {
    text = payload;
  } else {
    const emoji = LEVEL_EMOJI[payload.level ?? 'info'] ?? 'ℹ️';
    text = `${emoji} <b>${escapeHtml(payload.title)}</b>\n\n${escapeHtml(payload.content)}`;
  }
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_OPS_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, '[notify:ops] failed');
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
