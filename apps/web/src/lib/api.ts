import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers ?? {};
  const token = getAccessToken();
  if (token) {
    (cfg.headers as any).Authorization = `Bearer ${token}`;
  }
  // 设备指纹（若已采集）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fp = (window as any).__appFingerprint as string | undefined;
    if (fp) {
      (cfg.headers as any)['X-Device-Fingerprint'] = fp;
    }
  } catch {
    // ignore
  }
  // CSRF（若已经获取到）
  try {
    const csrf = (window as any).__csrfToken as string | undefined;
    if (csrf && cfg.method && !['get', 'head', 'options'].includes(cfg.method.toLowerCase())) {
      (cfg.headers as any)['X-CSRF-Token'] = csrf;
    }
  } catch {
    // ignore
  }
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
async function refreshTokens(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rt = getRefreshToken();
      if (!rt) return null;
      const { data } = await axios.post('/api/auth/refresh', { refreshToken: rt });
      if (data?.ok && data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        return data.data.accessToken as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

api.interceptors.response.use(
  (resp) => resp,
  async (err: AxiosError<any>) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (
      err.response?.status === 401 &&
      original &&
      !original._retry &&
      original.url &&
      !original.url.includes('/auth/refresh') &&
      !original.url.includes('/auth/login')
    ) {
      original._retry = true;
      const newToken = await refreshTokens();
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as any).Authorization = `Bearer ${newToken}`;
        return api(original);
      } else {
        clearTokens();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

/** 提取业务数据 + 错误统一抛出 */
export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await api.request<{ ok: boolean; data?: T; error?: { code: string; message: string } }>(config);
  if (!data.ok) throw new Error(data.error?.message ?? '请求失败');
  return data.data as T;
}
