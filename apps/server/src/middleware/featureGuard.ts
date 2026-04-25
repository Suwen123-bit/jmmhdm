import type { MiddlewareHandler } from 'hono';
import { isFeatureEnabled } from '../services/featureService.js';

/**
 * 功能开关中间件 — 关闭时拒绝所有请求
 * 用法: tradeRoutes.use('*', featureGuard('trade'))
 */
export function featureGuard(feature: string): MiddlewareHandler {
  return async (c, next) => {
    const enabled = await isFeatureEnabled(feature);
    if (!enabled) {
      return c.json(
        {
          ok: false,
          error: { code: 'FEATURE_DISABLED', message: '该功能已关闭，请稍后再试' },
        },
        403
      );
    }
    await next();
  };
}

/** 维护模式中间件 */
export function maintenanceGuard(): MiddlewareHandler {
  return async (c, next) => {
    const isMaintenance = await isFeatureEnabled('maintenance_mode'); // 简化处理
    if (isMaintenance) {
      const auth = c.get('auth');
      if (!auth || (auth.role !== 'admin' && auth.role !== 'super_admin')) {
        return c.json(
          { ok: false, error: { code: 'MAINTENANCE', message: '系统维护中，请稍后再试' } },
          503
        );
      }
    }
    await next();
  };
}
