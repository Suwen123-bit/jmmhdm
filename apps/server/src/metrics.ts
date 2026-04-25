/**
 * Prometheus 指标定义 + /metrics 端点用的 register
 *
 * 业务指标：
 *  - http_requests_total{method,path,status}
 *  - http_request_duration_ms{method,path}
 *  - trades_opened_total{symbol,direction}
 *  - trades_settled_total{symbol,result}
 *  - deposits_finished_total{currency}
 *  - withdrawals_finished_total
 *  - blindbox_opened_total{rarity}
 *  - notifications_sent_total{channel}
 *  - htx_connection_up (gauge)
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'path'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const tradesOpenedTotal = new Counter({
  name: 'trades_opened_total',
  help: 'Total options trades opened',
  labelNames: ['symbol', 'direction'] as const,
  registers: [registry],
});

export const tradesSettledTotal = new Counter({
  name: 'trades_settled_total',
  help: 'Total options trades settled',
  labelNames: ['symbol', 'result'] as const,
  registers: [registry],
});

export const depositsFinishedTotal = new Counter({
  name: 'deposits_finished_total',
  help: 'Total finished deposits',
  labelNames: ['currency'] as const,
  registers: [registry],
});

export const withdrawalsFinishedTotal = new Counter({
  name: 'withdrawals_finished_total',
  help: 'Total finished withdrawals',
  registers: [registry],
});

export const blindboxOpenedTotal = new Counter({
  name: 'blindbox_opened_total',
  help: 'Total blindbox openings',
  labelNames: ['rarity'] as const,
  registers: [registry],
});

export const notificationsSentTotal = new Counter({
  name: 'notifications_sent_total',
  help: 'Total notifications sent',
  labelNames: ['channel'] as const,
  registers: [registry],
});

export const htxConnectionUp = new Gauge({
  name: 'htx_connection_up',
  help: 'HTX WebSocket connection status (1 up, 0 down)',
  registers: [registry],
});

export const wsClientsConnected = new Gauge({
  name: 'ws_clients_connected',
  help: 'Currently connected WebSocket clients',
  registers: [registry],
});

export const aiAnomaliesTotal = new Counter({
  name: 'ai_anomalies_total',
  help: 'AI anomalies recorded',
  labelNames: ['category', 'severity'] as const,
  registers: [registry],
});
