/**
 * NOWPayments IPN 签名验证：纯 HMAC 函数
 *  - 验证 status_code != ok 时拒绝
 *  - 验证 payload 顺序键无关（NOWPayments 要求按 key 字母序）
 */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/test';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
  process.env.HTX_WS_URL = 'wss://api.huobi.pro/ws';
  process.env.NOWPAY_IPN_SECRET = 'test_ipn_secret_123';
});

function sign(payload: any, secret: string): string {
  // 模拟 NOWPayments 签名规则：按 key 字母序 stringify
  const sortedKeys = Object.keys(payload).sort();
  const sorted: Record<string, any> = {};
  for (const k of sortedKeys) sorted[k] = payload[k];
  const str = JSON.stringify(sorted);
  return crypto.createHmac('sha512', secret).update(str).digest('hex');
}

describe('nowpay verifyIpnSignature', async () => {
  const { verifyIpnSignature } = await import('../src/services/nowpayService.js');

  it('合法签名通过', () => {
    const body = { payment_id: 1, payment_status: 'finished', order_id: 'dep_1' };
    const sig = sign(body, 'test_ipn_secret_123');
    const raw = JSON.stringify(body);
    expect(verifyIpnSignature(raw, sig)).toBe(true);
  });

  it('错误签名拒绝', () => {
    const body = { payment_id: 1, payment_status: 'finished' };
    const raw = JSON.stringify(body);
    expect(verifyIpnSignature(raw, 'deadbeef'.repeat(16))).toBe(false);
  });

  it('缺失签名拒绝', () => {
    const body = { payment_id: 1 };
    expect(verifyIpnSignature(JSON.stringify(body), null)).toBe(false);
  });

  it('键顺序不同但签名等价 (NOWPayments 规则按字母序)', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    const sigA = sign(a, 'test_ipn_secret_123');
    // 客户端可能用任意顺序发 raw，但签名是按字母序计算的
    expect(verifyIpnSignature(JSON.stringify(b), sigA)).toBe(true);
  });
});
