import { create } from 'zustand';
import { request, setTokens, clearTokens, getAccessToken } from '../lib/api';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  fetchMe: () => Promise<void>;
  login: (account: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  fetchMe: async () => {
    if (!getAccessToken()) {
      set({ user: null });
      return;
    }
    try {
      set({ loading: true });
      const u = await request<AdminUser>({ url: '/user/me' });
      if (u.role !== 'admin' && u.role !== 'super_admin') {
        clearTokens();
        set({ user: null });
        return;
      }
      set({ user: u });
    } catch {
      clearTokens();
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },
  login: async (account, password, totpCode) => {
    const resp = await request<any>({ url: '/auth/login', method: 'POST', data: { account, password, totpCode } });
    if (resp.user.role !== 'admin' && resp.user.role !== 'super_admin') {
      throw new Error('非管理员账号无权登录');
    }
    setTokens(resp.accessToken, resp.refreshToken);
    set({ user: resp.user });
  },
  logout: async () => {
    try {
      await request({ url: '/auth/logout', method: 'POST' });
    } catch {}
    clearTokens();
    set({ user: null });
  },
}));
