import { create } from 'zustand';
import { request, setTokens, clearTokens, getAccessToken } from '../lib/api';

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  balance: string;
  frozenBalance: string;
  inviteCode: string;
  parentId: number | null;
  role: string;
  status: string;
  language: string;
  totpEnabled?: boolean;
  hasFundPassword?: boolean;
  kycLevel: number;
  kycStatus: string;
  createdAt: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  fetchMe: () => Promise<void>;
  login: (account: string, password: string, totpCode?: string) => Promise<{ totpRequired?: boolean }>;
  register: (input: { username: string; email: string; password: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  setUser: (user) => set({ user }),
  fetchMe: async () => {
    if (!getAccessToken()) {
      set({ user: null });
      return;
    }
    try {
      set({ loading: true });
      const u = await request<CurrentUser>({ url: '/user/me' });
      set({ user: u });
    } catch {
      clearTokens();
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },
  login: async (account, password, totpCode) => {
    const resp = await request<any>({
      url: '/auth/login',
      method: 'POST',
      data: { account, password, totpCode },
    }).catch(async (err) => {
      // 兼容 totp_required 200 响应
      throw err;
    });
    if (resp?.error?.code === 'TOTP_REQUIRED') {
      return { totpRequired: true };
    }
    setTokens(resp.accessToken, resp.refreshToken);
    set({ user: resp.user });
    return {};
  },
  register: async (input) => {
    const resp = await request<any>({
      url: '/auth/register',
      method: 'POST',
      data: input,
    });
    setTokens(resp.accessToken, resp.refreshToken);
    set({ user: resp.user });
  },
  logout: async () => {
    try {
      await request({ url: '/auth/logout', method: 'POST' });
    } catch {
      // ignore
    }
    clearTokens();
    set({ user: null });
  },
}));
