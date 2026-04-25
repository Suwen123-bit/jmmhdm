import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'admin.access';
const REFRESH_KEY = 'admin.refresh';

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const setTokens = (a: string, r: string) => {
  localStorage.setItem(TOKEN_KEY, a);
  localStorage.setItem(REFRESH_KEY, r);
};
export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

export const api: AxiosInstance = axios.create({ baseURL: '/api', timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const token = getAccessToken();
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as any).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
async function refresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rt = getRefreshToken();
      if (!rt) return null;
      const { data } = await axios.post('/api/auth/refresh', { refreshToken: rt });
      if (data?.ok) {
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
  (r) => r,
  async (err) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const tk = await refresh();
      if (tk) {
        original.headers = original.headers ?? {};
        (original.headers as any).Authorization = `Bearer ${tk}`;
        return api(original);
      } else {
        clearTokens();
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await api.request<{ ok: boolean; data?: T; error?: { message: string } }>(config);
  if (!data.ok) throw new Error(data.error?.message ?? '请求失败');
  return data.data as T;
}
