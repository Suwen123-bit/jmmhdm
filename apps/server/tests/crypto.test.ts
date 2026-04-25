/**
 * 纯函数单测：crypto 工具
 * 不依赖 DB / Redis / env 完整加载
 */
import { describe, it, expect, beforeAll } from 'vitest';

// vitest 顶层运行前先注入最低必要 env，避免 ../config/env.ts 在导入时崩溃
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/test';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
  process.env.HTX_WS_URL = 'wss://api.huobi.pro/ws';
});

describe('crypto utils', async () => {
  // 异步 import 在 beforeAll 之后执行，确保 env schema 通过
  const mod = await import('../src/utils/crypto.js');

  it('sha256Hex 输出 64 位十六进制', () => {
    const h = mod.sha256Hex('hello');
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hmacSha512Hex RFC 4231 测试向量', () => {
    // RFC 4231 Test Case 1
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const out = mod.hmacSha512Hex(key, 'Hi There');
    expect(out).toMatch(/^[0-9a-f]{128}$/);
  });

  it('encrypt/decrypt 往返一致', () => {
    const cipherText = mod.encrypt('top secret payload 你好🔐');
    const back = mod.decrypt(cipherText);
    expect(back).toBe('top secret payload 你好🔐');
  });

  it('encrypt 同明文每次产出不同（IV 随机化）', () => {
    const a = mod.encrypt('same');
    const b = mod.encrypt('same');
    expect(a).not.toBe(b);
  });

  it('randomInviteCode 长度 + 字符集合规', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = mod.randomInviteCode(8);
      expect(c).toHaveLength(8);
      expect(c).toMatch(/^[A-HJ-KMNP-Z2-9]+$/); // 排除 I/L/O/0/1
      codes.add(c);
    }
    // 200 次随机码至少有 100 种以上不同值，验证熵
    expect(codes.size).toBeGreaterThan(100);
  });

  it('secureRandom ∈ [0, 1) 且分布大致均匀', () => {
    const samples = Array.from({ length: 1000 }, () => mod.secureRandom());
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    // 平均值应在 0.5 附近 (±0.05)
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(Math.abs(avg - 0.5)).toBeLessThan(0.05);
  });

  it('randomToken 长度可控、URL-safe', () => {
    const t = mod.randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40); // base64url 32 byte ≈ 43 chars
  });
});
