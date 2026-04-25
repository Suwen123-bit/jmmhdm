import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | string, decimals = 2): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatUsdt(value: number | string): string {
  return `${formatNumber(value, 2)} USDT`;
}

export function formatPrice(value: number | string, decimals = 2): string {
  return formatNumber(value, decimals);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

export function formatDateTime(d: string | number | Date): string {
  return new Date(d).toLocaleString('zh-CN', { hour12: false });
}

export function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'mythic':
      return 'text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/10';
    case 'legendary':
      return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    case 'epic':
      return 'text-violet-400 border-violet-500/40 bg-violet-500/10';
    case 'rare':
      return 'text-sky-400 border-sky-500/40 bg-sky-500/10';
    default:
      return 'text-zinc-300 border-zinc-600/40 bg-zinc-700/20';
  }
}

export function rarityLabel(rarity: string): string {
  return (
    {
      common: '普通',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说',
      mythic: '神话',
    } as const
  )[rarity as 'common'] ?? rarity;
}
