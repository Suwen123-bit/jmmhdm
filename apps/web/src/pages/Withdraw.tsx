import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { useConfig } from '../store/config';
import { formatNumber, formatDateTime } from '../lib/utils';

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已批准',
  processing: '处理中',
  finished: '已完成',
  rejected: '已拒绝',
  failed: '已失败',
};

export default function Withdraw() {
  const user = useAuth((s) => s.user);
  const fetchMe = useAuth((s) => s.fetchMe);
  const config = useConfig((s) => s.config);
  const currencies = config?.depositCurrencies ?? [
    { code: 'usdt', network: 'TRC20', name: 'USDT (TRC20)' },
    { code: 'usdt', network: 'ERC20', name: 'USDT (ERC20)' },
  ];

  const [currency, setCurrency] = useState(currencies[0]?.code ?? 'usdt');
  const [network, setNetwork] = useState(currencies[0]?.network ?? 'TRC20');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [fundPassword, setFundPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const { data: list, refetch } = useQuery({
    queryKey: ['wallet', 'withdrawals'],
    queryFn: () => request<{ items: any[] }>({ url: '/wallet/withdrawals', params: { page: 1, pageSize: 20 } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      request({
        url: '/wallet/withdraw',
        method: 'POST',
        data: {
          currency,
          network,
          toAddress,
          amount: Number(amount),
          fundPassword,
          totpCode: totpCode || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('提现申请已提交，等待审核');
      setAmount('');
      setFundPassword('');
      setTotpCode('');
      void fetchMe();
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">提现</h1>
      <div className="card space-y-4">
        <div className="rounded-xl bg-zinc-800/60 p-3 text-sm">
          <span className="text-zinc-400">可用余额: </span>
          <span className="font-semibold">{user ? formatNumber(user.balance, 2) : '--'} USDT</span>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">币种 / 网络</label>
          <div className="grid grid-cols-2 gap-2">
            {currencies.map((c) => {
              const active = currency === c.code && network === c.network;
              return (
                <button
                  key={`${c.code}-${c.network}`}
                  onClick={() => {
                    setCurrency(c.code);
                    setNetwork(c.network);
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm ${active ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700'}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">提现地址</label>
          <input className="input font-mono" value={toAddress} onChange={(e) => setToAddress(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">提现金额 (USDT)</label>
          <input type="number" min={1} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">资金密码</label>
          <input type="password" className="input" value={fundPassword} onChange={(e) => setFundPassword(e.target.value)} required minLength={6} />
        </div>
        {user?.totpEnabled && (
          <div>
            <label className="mb-1 block text-sm text-zinc-300">2FA 验证码</label>
            <input className="input tracking-widest" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} required />
          </div>
        )}
        <button
          onClick={() => {
            if (!toAddress || !amount || !fundPassword) {
              toast.error('请填写完整信息');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
          className="btn-primary w-full py-3"
        >
          {mutation.isPending ? '提交中…' : '提交提现'}
        </button>
      </div>

      <div className="card">
        <h3 className="mb-3 font-semibold">提现记录</h3>
        <div className="space-y-2">
          {(list?.items ?? []).map((w) => (
            <div key={w.id} className="rounded-xl bg-zinc-800/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{formatNumber(w.amount, 2)} {w.currency.toUpperCase()} ({w.network})</span>
                <span className="text-amber-400">{STATUS_LABELS[w.status] ?? w.status}</span>
              </div>
              <div className="mt-1 break-all text-xs text-zinc-500 font-mono">{w.toAddress}</div>
              <div className="mt-1 text-xs text-zinc-500">{formatDateTime(w.createdAt)}</div>
            </div>
          ))}
          {!(list?.items ?? []).length && <div className="py-6 text-center text-zinc-500">暂无记录</div>}
        </div>
      </div>
    </div>
  );
}
