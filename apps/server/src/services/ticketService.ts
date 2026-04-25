import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tickets, ticketMessages, users } from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import { notify } from './notificationService.js';
import type { TicketType, TicketPriority } from '@app/shared';

export async function createTicket(opts: {
  userId: number;
  type: TicketType;
  subject: string;
  content: string;
  priority?: TicketPriority;
  attachments?: string[];
}) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        userId: opts.userId,
        type: opts.type,
        subject: opts.subject,
        priority: opts.priority ?? 'normal',
      })
      .returning();
    await tx.insert(ticketMessages).values({
      ticketId: ticket!.id,
      senderType: 'user',
      senderId: opts.userId,
      content: opts.content,
      attachments: opts.attachments ?? [],
    });
    return ticket!;
  });
}

export async function listUserTickets(userId: number, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(tickets)
      .where(eq(tickets.userId, userId))
      .orderBy(desc(tickets.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(eq(tickets.userId, userId)),
  ]);
  return { items, total: totalRow[0]?.count ?? 0, page, pageSize };
}

export async function getTicketDetail(ticketId: number, requesterUserId?: number, isAdmin = false) {
  const t = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!t[0]) throw new AppError('TICKET_NOT_FOUND', '工单不存在', 404);
  if (!isAdmin && t[0].userId !== requesterUserId) {
    throw new AppError('FORBIDDEN', '无权访问', 403);
  }
  const messages = await db
    .select({
      id: ticketMessages.id,
      ticketId: ticketMessages.ticketId,
      senderType: ticketMessages.senderType,
      senderId: ticketMessages.senderId,
      content: ticketMessages.content,
      attachments: ticketMessages.attachments,
      createdAt: ticketMessages.createdAt,
      senderName: users.username,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(ticketMessages.senderId, users.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(ticketMessages.createdAt);
  return { ticket: t[0], messages };
}

export async function replyTicket(opts: {
  ticketId: number;
  senderType: 'user' | 'admin';
  senderId: number;
  content: string;
  attachments?: string[];
}) {
  const t = await db.select().from(tickets).where(eq(tickets.id, opts.ticketId)).limit(1);
  if (!t[0]) throw new AppError('TICKET_NOT_FOUND', '工单不存在', 404);
  if (opts.senderType === 'user' && t[0].userId !== opts.senderId) {
    throw new AppError('FORBIDDEN', '无权访问', 403);
  }
  if (t[0].status === 'closed') throw new AppError('TICKET_CLOSED', '工单已关闭', 400);

  await db.insert(ticketMessages).values({
    ticketId: opts.ticketId,
    senderType: opts.senderType,
    senderId: opts.senderId,
    content: opts.content,
    attachments: opts.attachments ?? [],
  });

  // 状态流转：用户回复 → in_progress (如果是 resolved 则回到 in_progress)
  // admin 回复 → in_progress
  await db
    .update(tickets)
    .set({
      status: opts.senderType === 'user' && t[0].status === 'resolved' ? 'in_progress' : opts.senderType === 'admin' ? 'in_progress' : t[0].status,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, opts.ticketId));

  // 管理员回复 → 通知用户
  if (opts.senderType === 'admin') {
    await notify({
      userId: t[0].userId,
      type: 'ticket_replied',
      title: '工单回复',
      content: `您的工单「${t[0].subject}」收到新回复`,
      refType: 'ticket',
      refId: t[0].id,
    });
  }
}

export async function updateTicketStatus(ticketId: number, status: 'open' | 'in_progress' | 'resolved' | 'closed', adminId?: number) {
  const t = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!t[0]) throw new AppError('TICKET_NOT_FOUND', '工单不存在', 404);
  await db
    .update(tickets)
    .set({
      status,
      assignedTo: adminId ?? t[0].assignedTo,
      closedAt: status === 'closed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticketId));
}

export async function adminListTickets(opts: {
  status?: 'open' | 'in_progress' | 'resolved' | 'closed' | 'all';
  page: number;
  pageSize: number;
}) {
  const offset = (opts.page - 1) * opts.pageSize;
  const where = opts.status && opts.status !== 'all' ? eq(tickets.status, opts.status) : undefined;
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: tickets.id,
        userId: tickets.userId,
        username: users.username,
        type: tickets.type,
        subject: tickets.subject,
        status: tickets.status,
        priority: tickets.priority,
        assignedTo: tickets.assignedTo,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.userId, users.id))
      .where(where)
      .orderBy(desc(tickets.updatedAt))
      .limit(opts.pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(where ?? sql`true`),
  ]);
  return { items, total: totalRow[0]?.count ?? 0, page: opts.page, pageSize: opts.pageSize };
}
