import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Copy } from 'lucide-react';
import { request } from '../lib/api';
import { useConfig } from '../store/config';

export default function Deposit() {
  const config = useConfig((s) => s.config);
  const currencies = config?.depositCurrencies ?? [
    { code: 'usdttrc20', network: 'TRC20', name: 'USDT (TRC20)' },
    { code: 'usdterc20', network: 'ERC20', name: 'USDT (ERC20)' },
    { code: 'btc', network: 'BTC', name: 'Bitcoin' },
    { code: 'eth', network: 'ETH', name: 'Ethereum' },
  ];
  const [amount, setAmount] = useState('100');
  const [payCurrency, setPayCurrency] = useState(currencies[0]?.code ?? 'usdttrc20');
  const [order, setOrder] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: () =>
      request<any>({
        url: '/wallet/deposit',
        method: 'POST',
        data: { amountUsd: Number(amount), payCurrency },
      }),
    onSuccess: (data) => {
      setOrder(data);
      toast.success('订单已生成，请按提示完成支付');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success('已复制');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">充值</h1>
      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">金额 (USD)</label>
          <input type="number" className="input" min={10} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-2 flex gap-1">
            {[50, 100, 500, 1000].map((v) => (
              <button key={v} onClick={() => setAmount(String(v))} className="flex-1 rounded-lg bg-zinc-800 py-1.5 text-xs hover:bg-zinc-700">{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">选择币种 / 网络</label>
          <div className="grid grid-cols-2 gap-2">
            {currencies.map((c) => (
              <button
                key={c.code}
                onClick={() => setPayCurrency(c.code)}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  payCurrency === c.code ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary w-full py-3">
          {mutation.isPending ? '生成订单中…' : '生成充值订单'}
        </button>
      </div>

      {order && (
        <div className="card space-y-3">
          <h3 className="font-semibold">支付信息</h3>
          <div className="rounded-xl bg-zinc-800/60 p-3 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">订单号</span><span>{order.orderId}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-zinc-400">应付金额</span><span className="text-amber-400">{order.payAmount} {order.payCurrency.toUpperCase()}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-zinc-400">折合 USD</span><span>{order.priceAmount} USD</span></div>
          </div>
          <div>
            <div className="mb-1 text-sm text-zinc-300">收款地址</div>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" value={order.payAddress ?? ''} readOnly />
              <button onClick={() => copy(order.payAddress ?? '')} className="btn-ghost px-3"><Copy className="h-4 w-4" /></button>
            </div>
          </div>
          {order.payUrl && (
            <a href={order.payUrl} target="_blank" rel="noreferrer" className="btn-primary w-full py-2.5 text-center">
              打开 NOWPayments 支付页
            </a>
          )}
          <div className="text-xs text-zinc-500">完成转账后系统将在区块链确认后自动到账（通常 1~30 分钟）。</div>
        </div>
      )}
    </div>
  );
}
