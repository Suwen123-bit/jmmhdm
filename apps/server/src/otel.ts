/**
 * OpenTelemetry 初始化
 *
 * 启动时调用一次 startOtel()
 *  - 通过 OTEL_EXPORTER_OTLP_ENDPOINT 自动发到 collector / Tempo / Jaeger
 *  - 未配置时静默跳过
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './logger.js';

let sdk: NodeSDK | null = null;

export async function startOtel(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    logger.info('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set, skipping');
    return;
  }
  try {
    sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'crypto-platform-api',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? '1.0.0',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // 关闭 fs/dns 等噪声仪表
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });
    sdk.start();
    logger.info({ endpoint }, '[otel] started');
  } catch (e: any) {
    logger.error({ err: e?.message }, '[otel] start failed');
  }
}

export async function shutdownOtel(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (e: any) {
    logger.warn({ err: e?.message }, '[otel] shutdown failed');
  }
}
