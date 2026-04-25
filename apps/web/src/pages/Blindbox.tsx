import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Gift, Sparkles } from 'lucide-react';
import { request } from '../lib/api';
import { FeatureGate } from '../components/FeatureGate';
import { formatNumber } from '../lib/utils';

interface BlindboxItem {
  id: number;
  name: string;
  price: string;
  coverUrl: string;
  description: string;
  tags: string[];
  isLimited: boolean;
  limitCount: number | null;
  soldCount: number;
}

export default function Blindbox() {
  const { data, isLoading } = useQuery({
    queryKey: ['blindbox', 'list'],
    queryFn: () => request<{ items: BlindboxItem[] }>({ url: '/blindbox/list' }),
  });

  return (
    <FeatureGate feature="blindbox">
      <div className="space-y-4">
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-fuchsia-500/10 via-zinc-900 to-zinc-900 p-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Gift className="h-6 w-6 text-fuchsia-400" /> 盲盒商城
          </h1>
          <p className="mt-1 text-sm text-zinc-400">开启盲盒，解锁稀有奖励</p>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-zinc-400">加载中…</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {(data?.items ?? []).map((b) => {
              const stockLeft = b.isLimited && b.limitCount ? Math.max(0, b.limitCount - b.soldCount) : null;
              return (
                <Link
                  key={b.id}
                  to={`/blindbox/${b.id}`}
                  className="card group overflow-hidden p-0 hover:border-fuchsia-500/50"
                >
                  <div className="relative aspect-square bg-zinc-800">
                    {b.coverUrl && <img src={b.coverUrl} alt={b.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <div className="font-medium text-white">{b.name}</div>
                    </div>
                    {b.isLimited && stockLeft !== null && (
                      <span className="absolute right-2 top-2 rounded-full bg-rose-500/90 px-2 py-0.5 text-xs text-white">
                        剩余 {stockLeft}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-400 font-semibold">{formatNumber(b.price, 2)} USDT</span>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Sparkles className="h-3 w-3" /> 已售 {b.soldCount}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
