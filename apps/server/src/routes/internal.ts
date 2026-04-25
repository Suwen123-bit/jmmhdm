import { Hono } from 'hono';
import { notifyOps } from '../services/notificationDispatch.js';
import { logger } from '../logger.js';

/**
 * 内部端点（仅供本机/集群内部访问）
 *  - /alertmanager-webhook：接收 Alertmanager 转发的告警 JSON，转发到 Telegram ops 群
 *
 * 生产部署应在 nginx 上限制 IP 白名单
 */
const internal = new Hono();

interface AlertmanagerPayload {
  status: 'firing' | 'resolved';
  alerts: Array<{
    status: 'firing' | 'resolved';
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: string;
    endsAt?: string;
    generatorURL?: string;
  }>;
  groupLabels?: Record<string, string>;
  commonLabels?: Record<string, string>;
}

internal.post('/alertmanager-webhook', async (c) => {
  try {
    const payload = (await c.req.json()) as AlertmanagerPayload;
    for (const a of payload.alerts ?? []) {
      const sev = (a.labels?.severity ?? 'info') as 'info' | 'warning' | 'critical';
      const title = `[${a.status === 'firing' ? '🔥 FIRING' : '✅ RESOLVED'}] ${a.labels?.alertname ?? 'unknown'}`;
      const lines = [
        a.annotations?.summary ?? '',
        a.annotations?.description ?? '',
        `severity=${sev}`,
        Object.entries(a.labels ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(' · '),
      ].filter(Boolean);
      await notifyOps({
        title,
        content: lines.join('\n'),
        level: sev === 'critical' ? 'critical' : sev === 'warning' ? 'warning' : 'info',
      });
    }
    return c.json({ ok: true });
  } catch (e: any) {
    logger.error({ err: e?.message }, '[internal] alertmanager webhook error');
    return c.json({ ok: false, error: e?.message }, 500);
  }
});

export default internal;
