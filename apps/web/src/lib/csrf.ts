import axios from 'axios';

/**
 * 启动时获取 CSRF token，存到 window.__csrfToken
 * 由 api.ts 拦截器在写请求时自动附加 X-CSRF-Token 头
 */
export async function initCsrf(): Promise<void> {
  try {
    const { data } = await axios.get('/api/auth/csrf', { withCredentials: true });
    if (data?.ok && data.data?.csrfToken) {
      (window as any).__csrfToken = data.data.csrfToken;
    }
  } catch {
    // 静默失败 — 由后端校验拒绝
  }
}
