import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpToLine, History } from 'lucide-react';
import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { formatNumber, formatDateTime } from '../lib/utils';

export default function Wallet() {
  const user = useAuth((s) => s.user);
  const { data: logs } = useQuery({
    queryKey: ['wallet', 'logs'],
    queryFn: () => request<{ items: any[] }>({ url: '/user/wallet-logs', params: { page: 1, pageSize: 30 } }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-900 p-6">
        <div className="text-sm text-zinc-400">总资产 (USDT)</div>
        <div className="mt-2 text-4xl font-bold">{user ? formatNumber(user.balance, 2) : '--'}</div>
        <div className="mt-1 text-xs text-zinc-500">冻结: {user ? formatNumber(user.frozenBalance, 2) : '--'}</div>
        <div className="mt-4 flex gap-2">
          <Link to="/wallet/deposit" className="btn-primary flex-1">
            <ArrowDownToLine className="mr-1 h-4 w-4" /> 充值
          </Link>
          <Link to="/wallet/withdraw" className="btn-ghost flex-1">
            <ArrowUpToLine className="mr-1 h-4 w-4" /> 提现
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold">交易记录</h3>
        </div>
        <div className="space-y-2">
          {(logs?.items ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl bg-zinc-800/40 p-3 text-sm">
              <div>
                <div className="font-medium">{l.description ?? l.type}</div>
                <div className="text-xs text-zinc-500">{formatDateTime(l.createdAt)}</div>
              </div>
              <div className={Number(l.amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {Number(l.amount) >= 0 ? '+' : ''}
                {formatNumber(l.amount, 2)}
              </div>
            </div>
          ))}
          {!(logs?.items ?? []).length && (
            <div className="py-10 text-center text-zinc-500">暂无记录</div>
          )}
        </div>
      </div>
    </div>
  );
}
