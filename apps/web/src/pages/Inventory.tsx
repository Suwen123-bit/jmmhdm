import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { formatNumber, rarityColor, rarityLabel, cn } from '../lib/utils';

export default function Inventory() {
  const qc = useQueryClient();
  const fetchMe = useAuth((s) => s.fetchMe);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data } = useQuery({
    queryKey: ['blindbox', 'inventory'],
    queryFn: () => request<{ items: any[]; total: number }>({ url: '/blindbox/inventory', params: { page: 1, pageSize: 100 } }),
  });

  const exchangeMutation = useMutation({
    mutationFn: () =>
      request<{ totalValue: number }>({
        url: '/blindbox/exchange',
        method: 'POST',
        data: { inventoryIds: [...selected] },
      }),
    onSuccess: (resp) => {
      toast.success(`兑换成功，共获得 ${formatNumber(resp.totalValue, 2)} USDT`);
      setSelected(new Set());
      void fetchMe();
      qc.invalidateQueries({ queryKey: ['blindbox', 'inventory'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalValue = (data?.items ?? [])
    .filter((it) => selected.has(it.id))
    .reduce((sum, it) => sum + Number(it.product?.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">我的盲盒库存</h1>
        {selected.size > 0 && (
          <button onClick={() => exchangeMutation.mutate()} disabled={exchangeMutation.isPending} className="btn-primary">
            {exchangeMutation.isPending ? '兑换中…' : `兑换 ${selected.size} 件 (~${formatNumber(totalValue, 2)} USDT)`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {(data?.items ?? []).map((it) => {
          const sel = selected.has(it.id);
          return (
            <button
              key={it.id}
              onClick={() => toggle(it.id)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all',
                rarityColor(it.product?.rarity ?? 'common'),
                sel && 'ring-2 ring-amber-500 scale-[0.98]'
              )}
            >
              {it.product?.imageUrl && <img src={it.product.imageUrl} alt={it.product.name} className="mb-2 aspect-square w-full rounded-lg object-cover" />}
              <div className="text-sm font-medium">{it.product?.name}</div>
              <div className="mt-1 flex justify-between text-xs">
                <span>{rarityLabel(it.product?.rarity ?? 'common')}</span>
                <span>{formatNumber(it.product?.value, 2)}</span>
              </div>
            </button>
          );
        })}
        {!(data?.items ?? []).length && (
          <div className="col-span-full py-12 text-center text-zinc-500">暂无库存，去开盲盒吧！</div>
        )}
      </div>
    </div>
  );
}
