import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notifications, notificationPreferences } from '../db/schema.js';
import { publisher, CHANNELS } from '../redis.js';
import { WS_EVENTS } from '@app/shared';
import type { NotificationEvent, NotificationChannel } from '@app/shared';
import { notificationQueue } from '../jobs/queues.js';
import { logger } from '../logger.js';

export interface NotifyOptions {
  userId: number;
  type: NotificationEvent;
  title: string;
  content: string;
  refType?: string;
  refId?: string | number;
  /** 强制使用某些渠道；未指定则按用户偏好（缺省 in_app + email） */
  channels?: NotificationChannel[];
}

async function resolveChannels(
  userId: number,
  type: NotificationEvent
): Promise<NotificationChannel[]> {
  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.eventType, type as string)
      )
    )
    .limit(1);
  const p = prefs[0];
  if (!p) return ['in_app', 'email'];
  const out: NotificationChannel[] = [];
  if (p.inApp) out.push('in_app');
  if (p.email) out.push('email');
  if (p.webpush) out.push('webpush');
  if (p.telegram) out.push('telegram');
  return out;
}

/**
 * 发送通知（in_app 同步入库；email/telegram/webpush 异步排队）
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const channels = opts.channels ?? (await resolveChannels(opts.userId, opts.type));

  // 1) in_app 入库 + WS 推送
  if (channels.includes('in_app')) {
    await db.insert(notifications).values({
      userId: opts.userId,
      type: opts.type,
      channel: 'in_app',
      title: opts.title,
      content: opts.content,
      refType: opts.refType ?? null,
      refId: opts.refId !== undefined ? String(opts.refId) : null,
    });
    void publisher.publish(
      CHANNELS.USER_EVENT,
      JSON.stringify({
        userId: opts.userId,
        event: WS_EVENTS.NOTIFICATION,
        data: { type: opts.type, title: opts.title, content: opts.content },
      })
    );
  }

  // 2) 其他渠道走队列异步发送（worker 调用 dispatch）
  for (const ch of channels) {
    if (ch === 'in_app') continue;
    await notificationQueue.add(
      'dispatch',
      {
        userId: opts.userId,
        type: opts.type,
        channel: ch,
        title: opts.title,
        content: opts.content,
        refType: opts.refType ?? null,
        refId: opts.refId !== undefined ? String(opts.refId) : null,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 500 }
    );
  }

  logger.debug({ userId: opts.userId, type: opts.type, channels }, '[notify] queued');
}

export async function listUserNotifications(userId: number, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const [items, totalRow, unreadRow] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'in_app')))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'in_app'))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.channel, 'in_app'),
          eq(notifications.isRead, false)
        )
      ),
  ]);
  return {
    items,
    total: totalRow[0]?.count ?? 0,
    unread: unreadRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function markAllRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.channel, 'in_app')
      )
    );
}
