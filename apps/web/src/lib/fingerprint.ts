import FingerprintJS from '@fingerprintjs/fingerprintjs';

/**
 * 设备指纹采集（开源版 FPJS）
 * 生产可替换为 FingerprintJS Pro 以获得 99.5% 准确率
 *
 * 用法：在 main.tsx 中尽早调用一次 initFingerprint()，
 * api.ts 在每次请求时自动附加 X-Device-Fingerprint 头
 */

let cachedFp: string | null = null;

export async function initFingerprint(): Promise<string | null> {
  if (cachedFp) return cachedFp;
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    cachedFp = result.visitorId;
    // 持久化以减少计算开销
    try {
      if (cachedFp) localStorage.setItem('app.fingerprint', cachedFp);
    } catch {
      // ignore
    }
    return cachedFp;
  } catch (e) {
    console.warn('[fingerprint] init failed', e);
    return null;
  }
}

export function getFingerprint(): string | null {
  if (cachedFp) return cachedFp;
  try {
    cachedFp = localStorage.getItem('app.fingerprint');
  } catch {
    // ignore
  }
  return cachedFp;
}
