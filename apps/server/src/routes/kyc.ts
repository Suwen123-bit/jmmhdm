import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { kycSubmitSchema } from '@app/shared';
import { requireAuth } from '../middleware/auth.js';
import { handleError, ok } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { submitKyc, getKycStatus } from '../services/kycService.js';

const kyc = new Hono();

kyc.use('*', requireAuth);

kyc.get('/status', async (c) => {
  try {
    const { userId } = c.get('auth');
    const data = await getKycStatus(userId);
    return c.json(ok(data));
  } catch (e) {
    return handleError(e as Error, c);
  }
});

kyc.post(
  '/submit',
  rateLimit({ windowSec: 3600, max: 5, keyPrefix: 'rl:kyc:submit' }),
  zValidator('json', kycSubmitSchema),
  async (c) => {
    try {
      const { userId } = c.get('auth');
      const input = c.req.valid('json');
      const r = await submitKyc(userId, input);
      return c.json(ok(r));
    } catch (e) {
      return handleError(e as Error, c);
    }
  }
);

export default kyc;
