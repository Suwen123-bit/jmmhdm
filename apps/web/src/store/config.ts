import { create } from 'zustand';
import { request } from '../lib/api';

export interface PublicConfig {
  site: { name: string; logo: string; maintenance: boolean };
  features: Record<string, boolean>;
  symbols: Array<{ code: string; name: string; icon?: string; decimals?: number }>;
  durations: Array<{ value: number; label: string }>;
  depositCurrencies: Array<{ code: string; network: string; name: string }>;
}

interface ConfigState {
  config: PublicConfig | null;
  loading: boolean;
  fetchConfig: () => Promise<void>;
  isFeatureEnabled: (feature: string) => boolean;
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  fetchConfig: async () => {
    try {
      set({ loading: true });
      const cfg = await request<PublicConfig>({ url: '/config/public' });
      set({ config: cfg });
    } finally {
      set({ loading: false });
    }
  },
  isFeatureEnabled: (feature: string) => {
    return !!get().config?.features?.[feature];
  },
}));
