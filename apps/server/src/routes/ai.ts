import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { stream } from 'hono/streaming';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { handleError } from '../middleware/errorHandler.js';
import { chatStream } from '../services/aiService.js';
import { logger } from '../logger.js';

const ai = new Hono();
ai.use('*', requireAuth);

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(20),
});

/**
 * SSE 流式输出 OpenAI 兼容响应
 *  - 客户端使用 fetch + ReadableStream 解析；或 EventSource（仅 GET，不适用此处）
 *  - 我们直接把 OpenAI 的 SSE chunks 透传，前端解析 `data: ...` JSON 行
 */
ai.post(
  '/chat',
  rateLimit({ windowSec: 60, max: 20, keyPrefix: 'rl:ai:chat' }),
  zValidator('json', chatSchema),
  async (c) => {
    try {
      const { messages } = c.req.valid('json');
      const upstream = await chatStream(messages);
      c.header('Content-Type', 'text/event-stream; charset=utf-8');
      c.header('Cache-Control', 'no-cache, no-transform');
      c.header('Connection', 'keep-alive');
      c.header('X-Accel-Buffering', 'no');
      return stream(c, async (s) => {
        const reader = upstream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await s.write(value);
          }
        } catch (err: any) {
          logger.error({ err: err?.message }, '[ai] stream forward error');
        } finally {
          reader.releaseLock();
        }
      });
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

export default ai;
