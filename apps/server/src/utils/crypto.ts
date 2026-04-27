import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const key = env.ENCRYPTION_KEY;
  if (!key) {
    // 开发环境降级：用 JWT secret 派生
    return crypto.createHash('sha256').update(env.JWT_ACCESS_SECRET).digest();
  }
  // 期望 base64 编码的 32 字节 key；若长度不符，则用 sha256 派生确保 32 字节
  const buf = Buffer.from(key, 'base64');
  if (buf.length === 32) return buf;
  return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha512Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomInviteCode(len = 8): string {
  // 大写字母 + 数字
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/**
 * 加密随机数 (0,1) - 用于盲盒抽奖
 */
export function secureRandom(): number {
  const buf = crypto.randomBytes(8);
  // 转换为 53-bit 精度的 [0, 1)
  const hi = buf.readUInt32BE(0) >>> 5; // 27 bits
  const lo = buf.readUInt32BE(4) >>> 6; // 26 bits
  return (hi * 2 ** 26 + lo) / 2 ** 53;
}
