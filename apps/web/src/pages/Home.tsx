import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Gift, Wallet, Users } from 'lucide-react';
import { useConfig } from '../store/config';
import { usePrice } from '../store/price';
import { formatNumber } from '../lib/utils';

export default function Home() {
  const config = useConfig((s) => s.config);
  const ticks = usePrice((s) => s.ticks);
  const initPrice = usePrice((s) => s.init);

  useEffect(() => {
    if (config?.symbols?.length) {
      void initPrice(config.symbols.map((s) => s.code));
    }
  }, [config?.symbols, initPrice]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-900 p-8">
        <h1 className="text-3xl font-bold md:text-4xl">{config?.site.name ?? '全球加密交易平台'}</h1>
        <p className="mt-3 max-w-xl text-zinc-300">
          实时行情 · 短期合约 · 限时盲盒 · 多级佣金。一站式数字资产体验。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {config?.features?.trade !== false && (
            <Link to="/trade" className="btn-primary">立即交易</Link>
          )}
          {config?.features?.blindbox !== false && (
            <Link to="/blindbox" className="btn-ghost">开盲盒 →</Link>
          )}
        </div>
      </section>

      {/* 行情 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">热门行情</h2>
          <Link to="/trade" className="text-sm text-amber-400">查看全部 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {(config?.symbols ?? []).map((s) => {
            const t = ticks[s.code];
            const up = (t?.change24h ?? 0) >= 0;
            return (
              <Link
                key={s.code}
                to={`/trade/${s.code}`}
                className="card flex flex-col gap-1 hover:border-amber-500/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  {up ? (
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-400" />
                  )}
                </div>
                <div className="text-xl font-semibold">
                  {t ? formatNumber(t.price, s.decimals ?? 2) : '--'}
                </div>
                <div className={up ? 'text-xs text-emerald-400' : 'text-xs text-rose-400'}>
                  {t ? `${up ? '+' : ''}${(t.change24h * 100).toFixed(2)}%` : '--'}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 功能入口 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { to: '/wallet/deposit', icon: Wallet, title: '充值', desc: 'USDT / BTC / ETH' },
          { to: '/blindbox', icon: Gift, title: '盲盒', desc: '稀有奖励等你来' },
          { to: '/trade', icon: TrendingUp, title: '合约', desc: '60s/5min/10min' },
          { to: '/agent', icon: Users, title: '推广', desc: '多级返佣' },
        ].map((it) => (
          <Link key={it.to} to={it.to} className="card group hover:border-amber-500/50">
            <it.icon className="mb-3 h-7 w-7 text-amber-400 transition-transform group-hover:scale-110" />
            <div className="font-medium">{it.title}</div>
            <div className="text-xs text-zinc-400">{it.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
