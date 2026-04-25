import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { KlineChart } from '../components/KlineChart';
import { FeatureGate } from '../components/FeatureGate';
import { useAuth } from '../store/auth';
import { useConfig } from '../store/config';
import { usePrice } from '../store/price';
import { request } from '../lib/api';
import { formatNumber, formatDateTime, cn } from '../lib/utils';

export default function Trade() {
  const navigate = useNavigate();
  const params = useParams<{ symbol?: string }>();
  const config = useConfig((s) => s.config);
  const user = useAuth((s) => s.user);
  const fetchMe = useAuth((s) => s.fetchMe);
  const initPrice = usePrice((s) => s.init);
  const ticks = usePrice((s) => s.ticks);
  const queryClient = useQueryClient();

  const symbols = config?.symbols ?? [];
  const symbol = params.symbol ?? symbols[0]?.code ?? 'btcusdt';
  const symInfo = symbols.find((s) => s.code === symbol);
  const tick = ticks[symbol];

  const [interval, setInterval] = useState<'1min' | '5min' | '15min' | '60min' | '1day'>('5min');
  const [duration, setDuration] = useState(60);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [amount, setAmount] = useState('100');

  const durations = config?.durations ?? [
    { value: 60, label: '60秒' },
    { value: 300, label: '5分钟' },
    { value: 600, label: '10分钟' },
  ];

  useEffect(() => {
    if (symbols.length) void initPrice(symbols.map((s) => s.code));
  }, [symbols, initPrice]);

  // 我的订单
  const { data: tradesResp } = useQuery({
    queryKey: ['trade', 'list'],
    queryFn: () =>
      request<{ items: any[]; total: number }>({
        url: '/trade/list',
        params: { status: 'all', page: 1, pageSize: 20 },
      }),
    enabled: !!user,
    refetchInterval: 5000,
  });

  // 风控
  const { data: risk } = useQuery({
    queryKey: ['trade', 'risk', symbol, duration],
    queryFn: () => request<any>({ url: '/trade/risk', params: { symbol, duration } }),
  });

  const openMutation = useMutation({
    mutationFn: () =>
      request({
        url: '/trade/open',
        method: 'POST',
        data: { symbol, direction, amount: Number(amount), duration },
      }),
    onSuccess: () => {
      toast.success('下单成功');
      void fetchMe();
      queryClient.invalidateQueries({ queryKey: ['trade', 'list'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const onSubmit = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    const a = Number(amount);
    if (!a || a <= 0) {
      toast.error('请输入金额');
      return;
    }
    openMutation.mutate();
  };

  const up = (tick?.change24h ?? 0) >= 0;

  return (
    <FeatureGate feature="trade">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Symbol selector */}
          <div className="flex flex-wrap gap-2 overflow-x-auto no-scrollbar">
            {symbols.map((s) => {
              const t = ticks[s.code];
              const isActive = s.code === symbol;
              return (
                <button
                  key={s.code}
                  onClick={() => navigate(`/trade/${s.code}`)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    isActive ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 hover:border-zinc-600'
                  )}
                >
                  <div className="text-xs text-zinc-400">{s.name}</div>
                  <div className="font-medium">{t ? formatNumber(t.price, s.decimals ?? 2) : '--'}</div>
                </button>
              );
            })}
          </div>

          {/* Chart */}
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold">
                  {symInfo?.name ?? symbol}
                  <span className={cn('ml-3 text-base', up ? 'text-emerald-400' : 'text-rose-400')}>
                    {tick ? formatNumber(tick.price, symInfo?.decimals ?? 2) : '--'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                  <span>24h 高: {tick ? formatNumber(tick.high24h, symInfo?.decimals ?? 2) : '--'}</span>
                  <span>24h 低: {tick ? formatNumber(tick.low24h, symInfo?.decimals ?? 2) : '--'}</span>
                  <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                    {tick ? `${up ? '+' : ''}${(tick.change24h * 100).toFixed(2)}%` : '--'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                {(['1min', '5min', '15min', '60min', '1day'] as const).map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={cn(
                      'rounded-lg px-2 py-1 text-xs',
                      interval === iv ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    )}
                  >
                    {iv}
                  </button>
                ))}
              </div>
            </div>
            <KlineChart symbol={symbol} interval={interval} height={400} />
          </div>

          {/* My orders */}
          <div className="card">
            <h3 className="mb-3 font-semibold">我的订单</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="px-2 py-2 text-left">币种</th>
                    <th className="px-2 py-2 text-left">方向</th>
                    <th className="px-2 py-2 text-right">金额</th>
                    <th className="px-2 py-2 text-right">入场价</th>
                    <th className="px-2 py-2 text-right">结算价</th>
                    <th className="px-2 py-2 text-right">盈亏</th>
                    <th className="px-2 py-2 text-right">状态</th>
                    <th className="px-2 py-2 text-right">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {(tradesResp?.items ?? []).map((t) => (
                    <tr key={t.id} className="border-t border-zinc-800">
                      <td className="px-2 py-2 uppercase">{t.symbol}</td>
                      <td className={cn('px-2 py-2', t.direction === 'up' ? 'text-emerald-400' : 'text-rose-400')}>
                        {t.direction === 'up' ? '买涨' : '买跌'}
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(t.amount, 2)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(t.entryPrice, 2)}</td>
                      <td className="px-2 py-2 text-right">{t.exitPrice ? formatNumber(t.exitPrice, 2) : '-'}</td>
                      <td className={cn('px-2 py-2 text-right', Number(t.profit) > 0 ? 'text-emerald-400' : Number(t.profit) < 0 ? 'text-rose-400' : '')}>
                        {t.status === 'open' ? '-' : formatNumber(t.profit, 2)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {t.status === 'open' ? <span className="text-amber-400">进行中</span> : t.result === 'win' ? <span className="text-emerald-400">盈利</span> : t.result === 'lose' ? <span className="text-rose-400">亏损</span> : '平局'}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-400">{formatDateTime(t.createdAt)}</td>
                    </tr>
                  ))}
                  {!(tradesResp?.items ?? []).length && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-500">暂无订单</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Order panel */}
        <aside className="card h-fit space-y-4 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-2">
            {durations.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={cn(
                  'rounded-xl border py-2 text-sm',
                  duration === d.value ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          {risk?.payoutRate && (
            <div className="rounded-xl bg-zinc-800/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">收益率</span>
                <span className="text-amber-400">{(risk.payoutRate * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-zinc-400">单笔上限</span>
                <span>{formatNumber(risk.maxSingleBet, 0)} USDT</span>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-zinc-300">下单金额 (USDT)</label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="最低 10"
              min={10}
              step="0.01"
            />
            <div className="mt-2 flex gap-1">
              {[50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="flex-1 rounded-lg bg-zinc-800 py-1 text-xs hover:bg-zinc-700"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setDirection('up');
                onSubmit();
              }}
              disabled={openMutation.isPending}
              className="btn-up py-3"
            >
              <TrendingUp className="mr-1 h-4 w-4" /> 买涨
            </button>
            <button
              onClick={() => {
                setDirection('down');
                onSubmit();
              }}
              disabled={openMutation.isPending}
              className="btn-down py-3"
            >
              <TrendingDown className="mr-1 h-4 w-4" /> 买跌
            </button>
          </div>
          {user && (
            <div className="text-center text-xs text-zinc-400">
              可用余额: <span className="text-zinc-100">{formatNumber(user.balance, 2)} USDT</span>
            </div>
          )}
        </aside>
      </div>
    </FeatureGate>
  );
}
