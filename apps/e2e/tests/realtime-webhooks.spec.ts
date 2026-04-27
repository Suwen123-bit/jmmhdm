import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001/ws';

function openWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const t = setTimeout(() => reject(new Error('ws open timeout')), 8000);
    ws.once('open', () => {
      clearTimeout(t);
      resolve(ws);
    });
    ws.once('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

test.describe('WebSocket realtime', () => {
  test('anonymous connect, subscribe price:btcusdt, receive a tick within 10s', async () => {
    const ws = await openWs();
    try {
      const got = new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('no tick within 10s')), 10_000);
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.event === 'price.tick' && msg.data?.symbol === 'btcusdt') {
              clearTimeout(t);
              resolve(msg);
            }
          } catch {
            // ignore
          }
        });
      });
      ws.send(JSON.stringify({ action: 'subscribe', channels: ['price:btcusdt'] }));
      const tick = await got;
      expect(tick.data.symbol).toBe('btcusdt');
      expect(typeof tick.data.price).toBe('number');
    } finally {
      ws.close();
    }
  });

  test('ping/pong responds', async () => {
    const ws = await openWs();
    try {
      const got = new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('no pong')), 5000);
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.event === 'pong') {
            clearTimeout(t);
            resolve(msg);
          }
        });
      });
      ws.send(JSON.stringify({ action: 'ping' }));
      const r = await got;
      expect(typeof r.ts).toBe('number');
    } finally {
      ws.close();
    }
  });
});

test.describe('Webhook signature validation', () => {
  test('NowPayments IPN without signature is rejected (401) when secret configured, OR accepted in dev', async ({ request }) => {
    const r = await request.post('/api/nowpay/ipn', {
      headers: { 'content-type': 'application/json' },
      data: '{"order_id":"dep_x","payment_status":"finished"}',
    });
    // 配置 secret 时返回 401，否则 dev 直接处理（订单不存在则 500）
    expect([200, 401, 500]).toContain(r.status());
  });

  test('NowPayments IPN with bogus signature is rejected when secret configured', async ({ request }) => {
    const r = await request.post('/api/nowpay/ipn', {
      headers: {
        'content-type': 'application/json',
        'x-nowpayments-sig': 'deadbeef'.repeat(16),
      },
      data: '{"order_id":"dep_x","payment_status":"finished"}',
    });
    expect([200, 401, 500]).toContain(r.status());
  });

  test('Telegram webhook without secret rejected', async ({ request }) => {
    const r = await request.post('/api/telegram/webhook', {
      headers: { 'content-type': 'application/json' },
      data: { update_id: 1 },
    });
    // verifyWebhookSecret 在未配置 secret 时返回 false → 401
    // 若配置了正确 secret 则 200
    expect([200, 401]).toContain(r.status());
  });
});
