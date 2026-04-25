import { Hono } from 'hono';
import {
  handleIpn,
  verifyIpnSignature,
  handlePayoutIpn,
} from '../services/nowpayService.js';
import { logger } from '../logger.js';

const nowpay = new Hono();

/**
 * NOWPayments IPN 回调（支付与 Payout 共用入口）
 * Header: x-nowpayments-sig (HMAC-SHA512)
 *  - 充值 IPN: 包含 order_id（dep_*）/ payment_status
 *  - Payout IPN: 包含 unique_external_id（wd_*）/ status / hash
 */
nowpay.post('/ipn', async (c) => {
  const sig = c.req.header('x-nowpayments-sig') ?? null;
  const raw = await c.req.text();
  const valid = verifyIpnSignature(raw, sig);
  if (!valid) {
    logger.warn({ sig }, '[nowpay] IPN signature invalid');
    return c.json({ ok: false, error: 'Invalid signature' }, 401);
  }
  try {
    const payload = JSON.parse(raw);
    const externalId = payload?.unique_external_id ?? '';
    if (typeof externalId === 'string' && externalId.startsWith('wd_')) {
      await handlePayoutIpn(payload);
    } else {
      await handleIpn(payload, payload);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    logger.error({ err: e.message }, '[nowpay] IPN process error');
    return c.json({ ok: false, error: e.message }, 500);
  }
});

export default nowpay;
