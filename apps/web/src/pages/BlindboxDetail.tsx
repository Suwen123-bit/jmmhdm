import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { request } from '../lib/api';
import { FeatureGate } from '../components/FeatureGate';
import { useAuth } from '../store/auth';
import { formatNumber, rarityColor, rarityLabel, cn } from '../lib/utils';

export default function BlindboxDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const fetchMe = useAuth((s) => s.fetchMe);
  const [count, setCount] = useState(1);
  const [results, setResults] = useState<any[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['blindbox', 'detail', id],
    queryFn: () => request<any>({ url: `/blindbox/detail/${id}` }),
    enabled: !!id,
  });

  const openMutation = useMutation({
    mutationFn: () =>
      request<{ items: any[]; total: number }>({
        url: '/blindbox/open',
        method: 'POST',
        data: { blindboxId: Number(id), count },
      }),
    onSuccess: (resp) => {
      setResults(resp.items);
      toast.success(`成功开启 ${resp.items.length} 个盲盒`);
      void fetchMe();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="py-10 text-center text-zinc-400">加载中…</div>;
  const total = (Number(data.price) * count).toFixed(2);

  return (
    <FeatureGate feature="blindbox">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* 左侧 */}
        <div className="space-y-4">
          <div className="card overflow-hidden p-0">
            {data.coverUrl && <img src={data.coverUrl} alt={data.name} className="aspect-video w-full object-cover" />}
            <div className="p-5">
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="mt-2 text-sm text-zinc-400">{data.description}</p>
              {data.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {data.tags.map((t: string) => (
                    <span key={t} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3 font-semibold">奖品池</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(data.items ?? []).map((it: any) => (
                <div key={it.productId} className={cn('rounded-xl border p-3', rarityColor(it.product.rarity))}>
                  {it.product.imageUrl && <img src={it.product.imageUrl} alt={it.product.name} className="mb-2 aspect-square w-full rounded-lg object-cover" />}
                  <div className="text-sm font-medium">{it.product.name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span>{rarityLabel(it.product.rarity)}</span>
                    <span>{(Number(it.probability) * 100).toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {results && (
            <div className="card">
              <h3 className="mb-3 font-semibold">本次开启结果</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {results.map((r) => (
                  <div key={r.id} className={cn('rounded-xl border p-3 text-center', rarityColor(r.product.rarity))}>
                    {r.product.imageUrl && <img src={r.product.imageUrl} alt={r.product.name} className="mb-2 aspect-square w-full rounded-lg object-cover" />}
                    <div className="text-sm font-medium">{r.product.name}</div>
                    <div className="text-xs">价值 {formatNumber(r.product.value, 2)}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/inventory')} className="btn-ghost mt-3 w-full">查看我的库存</button>
            </div>
          )}
        </div>

        {/* 右侧 */}
        <aside className="card h-fit space-y-4 lg:sticky lg:top-20">
          <div className="text-3xl font-bold text-amber-400">{formatNumber(data.price, 2)} USDT</div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">购买数量 (1-10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="input"
            />
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[1, 3, 5, 10].map((v) => (
                <button key={v} onClick={() => setCount(v)} className="rounded-lg bg-zinc-800 py-1 text-xs hover:bg-zinc-700">×{v}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-between rounded-xl bg-zinc-800/60 p-3 text-sm">
            <span className="text-zinc-400">合计</span>
            <span className="text-amber-400 font-semibold">{total} USDT</span>
          </div>
          <button
            disabled={openMutation.isPending}
            onClick={() => {
              if (!user) {
                navigate('/login');
                return;
              }
              openMutation.mutate();
            }}
            className="btn-primary w-full py-3"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {openMutation.isPending ? '开启中…' : '立即开启'}
          </button>
          {user && (
            <div className="text-center text-xs text-zinc-400">
              余额: <span className="text-zinc-100">{formatNumber(user.balance, 2)} USDT</span>
            </div>
          )}
        </aside>
      </div>
    </FeatureGate>
  );
}
