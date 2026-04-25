import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ticketCreateSchema, ticketReplySchema } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { ok, handleError } from '../middleware/errorHandler.js';
import {
  createTicket,
  listUserTickets,
  getTicketDetail,
  replyTicket,
} from '../services/ticketService.js';

const ticket = new Hono();
ticket.use('*', requireAuth);

ticket.post('/create', zValidator('json', ticketCreateSchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = c.req.valid('json');
    const t = await createTicket({ userId, ...data });
    return c.json(ok(t));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

ticket.get('/list', async (c) => {
  try {
    const { userId } = c.get('auth');
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20)));
    const data = await listUserTickets(userId, page, pageSize);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

ticket.get('/detail/:id', async (c) => {
  try {
    const { userId } = c.get('auth');
    const id = Number(c.req.param('id'));
    const data = await getTicketDetail(id, userId, false);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

ticket.post('/reply', zValidator('json', ticketReplySchema), async (c) => {
  try {
    const { userId } = c.get('auth');
    const { ticketId, content, attachments } = c.req.valid('json');
    await replyTicket({ ticketId, senderType: 'user', senderId: userId, content, attachments });
    return c.json(ok({ success: true }));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

export default ticket;
