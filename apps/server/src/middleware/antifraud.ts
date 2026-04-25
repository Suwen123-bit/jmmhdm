import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ipBlacklist, geoBlocks, deviceFingerprints } from '../db/schema.js';
import { redis } from '../redis.js';
import { getClientIp, getCountryCode, getDeviceFingerprint } from '../utils/request.js';
import { logger } from '../logger.js';

const IP_CACHE_KEY = 'antifraud:ip_blacklist';
const GEO_CACHE_KEY = 'antifraud:geo_blocks';
const CACHE_TTL_SEC = 60;

/**
 * 加载 IP 黑名单（缓存到 Redis）
 */
async function loadIpBlacklist(): Promise<string[]> {
  const cached = await redis.get(IP_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      // ignore
    }
  }
  const rows = await db.select({ ipOrCidr: ipBlacklist.ipOrCidr }).from(ipBlacklist);
  const list = rows.map((r) => r.ipOrCidr);
  await redis.set(IP_CACHE_KEY, JSON.stringify(list), 'EX', CACHE_TTL_SEC);
  return list;
}

/**
 * 加载启用的封禁国家码（缓存到 Redis）
 */
async function loadGeoBlocks(): Promise<Set<string>> {
  const cached = await redis.get(GEO_CACHE_KEY);
  if (cached) {
    try {
      return new Set(JSON.parse(cached) as string[]);
    } catch {
      // ignore
    }
  }
  const rows = await db
    .select({ code: geoBlocks.countryCode })
    .from(geoBlocks)
    .where(eq(geoBlocks.enabled, true));
  const list = rows.map((r) => r.code.toUpperCase());
  await redis.set(GEO_CACHE_KEY, JSON.stringify(list), 'EX', CACHE_TTL_SEC);
  return new Set(list);
}

/**
 * 清理黑名单 / 地域封禁缓存（管理员变更后调用）
 */
export async function invalidateAntifraudCache(): Promise<void> {
  await redis.del(IP_CACHE_KEY, GEO_CACHE_KEY);
}

/**
 * 朴素 IP/CIDR 匹配：完整 IP 等值匹配 或 CIDR 前缀匹配（v4 简化版）
 */
function ipMatches(ip: string, ruleList: string[]): boolean {
  if (!ip || ip === 'unknown') return false;
  for (const rule of ruleList) {
    if (rule === ip) return true;
    if (rule.includes('/')) {
      // CIDR (仅 IPv4 简化实现)
      const [base, bitsStr] = rule.split('/');
      const bits = parseInt(bitsStr ?? '32', 10);
      if (Number.isFinite(bits) && base) {
        const ipInt = ipv4ToInt(ip);
        const baseInt = ipv4ToInt(base);
        if (ipInt != null && baseInt != null) {
          const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
          if ((ipInt & mask) === (baseInt & mask)) return true;
        }
      }
    }
  }
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isFinite(x) || x < 0 || x > 255) return null;
    n = (n << 8) | x;
  }
  return n >>> 0;
}

/**
 * 反欺诈中间件：IP 黑名单 + 地域封禁
 *  - 命中 IP 黑名单 → 403 IP_BLOCKED
 *  - 命中地域封禁 → 403 GEO_BLOCKED
 *  - 异步采集设备指纹（不阻塞请求）
 */
export const antifraudGuard: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  try {
    const [ipList, geoSet] = await Promise.all([loadIpBlacklist(), loadGeoBlocks()]);
    if (ipMatches(ip, ipList)) {
      logger.warn({ ip, path: c.req.path }, '[antifraud] IP blocked');
      return c.json(
        { ok: false, error: { code: 'IP_BLOCKED', message: '当前 IP 已被限制访问' } },
        403
      );
    }
    const country = getCountryCode(c);
    if (country && geoSet.has(country)) {
      logger.warn({ ip, country, path: c.req.path }, '[antifraud] geo blocked');
      return c.json(
        {
          ok: false,
          error: { code: 'GEO_BLOCKED', message: '当前地区暂不提供服务' },
        },
        403
      );
    }
  } catch (e: any) {
    // 反欺诈失败不应阻塞业务，仅记录
    logger.error({ err: e?.message }, '[antifraud] guard error, allowing through');
  }
  await next();
};

/**
 * 登录后调用：记录设备指纹（非阻塞）
 */
export async function recordDeviceFingerprint(
  userId: number,
  fingerprintHash: string,
  deviceInfo: any
): Promise<void> {
  try {
    // upsert: 已有则更新 lastSeen，否则插入
    const existing = await db
      .select({ id: deviceFingerprints.id })
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.fingerprintHash, fingerprintHash))
      .limit(1);
    if (existing[0]) {
      await db
        .update(deviceFingerprints)
        .set({ lastSeen: new Date() })
        .where(eq(deviceFingerprints.id, existing[0].id));
    } else {
      await db.insert(deviceFingerprints).values({
        userId,
        fingerprintHash,
        deviceInfo,
      });
    }
  } catch (e: any) {
    logger.error({ err: e?.message }, '[antifraud] record fingerprint error');
  }
}

export { getDeviceFingerprint };
