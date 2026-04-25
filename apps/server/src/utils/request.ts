import type { Context } from 'hono';

/**
 * 从代理头中提取客户端 IP（按优先级）
 *  - cf-connecting-ip (Cloudflare)
 *  - x-real-ip (Nginx)
 *  - x-forwarded-for 第一个
 */
export function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * 提取国家码（依赖反代/CDN 注入的国家码头）
 *  - cf-ipcountry (Cloudflare)
 *  - x-country-code（自建反代）
 */
export function getCountryCode(c: Context): string | null {
  const cc =
    c.req.header('cf-ipcountry') || c.req.header('x-country-code') || null;
  if (!cc) return null;
  const upper = cc.toUpperCase();
  // 'XX' / 'T1' / 'ZZ' 等无效值
  if (upper.length !== 2 || upper === 'XX' || upper === 'ZZ' || upper === 'T1') return null;
  return upper;
}

/**
 * 设备指纹：来自前端的 X-Device-Fingerprint 头（FingerprintJS 等生成）
 */
export function getDeviceFingerprint(c: Context): string | null {
  const fp = c.req.header('x-device-fingerprint');
  return fp && fp.length >= 16 && fp.length <= 256 ? fp : null;
}
