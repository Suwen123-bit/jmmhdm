import { create } from 'zustand';
import { request } from '../lib/api';
import { ws } from '../lib/ws';

export interface PriceTick {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  ts: number;
}

interface PriceState {
  ticks: Record<string, PriceTick>;
  init: (symbols: string[]) => Promise<void>;
}

export const usePrice = create<PriceState>((set, get) => ({
  ticks: {},
  init: async (symbols: string[]) => {
    const data = await request<Record<string, PriceTick>>({
      url: '/trade/tickers',
      params: { symbols: symbols.join(',') },
    });
    set({ ticks: data });
    ws.subscribe(symbols.map((s) => `price:${s}`));
  },
}));

ws.on((event, data) => {
  if (event === 'price.tick' && data?.symbol) {
    usePrice.setState((s) => ({
      ticks: { ...s.ticks, [data.symbol]: data },
    }));
  }
});
