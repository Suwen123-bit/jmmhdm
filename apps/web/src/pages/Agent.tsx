import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, DollarSign, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { FeatureGate } from '../components/FeatureGate';
import { formatNumber, formatDateTime } from '../lib/utils';

export default function Agent() {
  const user = useAuth((s) => s.user);
  const { data: stats } = useQuery({ queryKey: ['agent', 'stats'], queryFn: () => request<any>({ url: '/agent/stats' }) });
  const { data: team } = useQuery({ queryKey: ['agent', 'team'], queryFn: () => request<any>({ url: '/agent/team' }) });
  const { data: commissions } = useQuery({
    queryKey: ['agent', 'commissions'],
    queryFn: () => request<{ items: any[] }>({ url: '/agent/commissions', params: { page: 1, pageSize: 20 } }),
  });

  const inviteUrl = user ? `${window.location.origin}/register?invite=${user.inviteCode}` : '';

  return (
    <FeatureGate feature="agent">
      <div className="space-y-4">
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 p-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-emerald-400" /> 推广中心
          </h1>
          <div className="mt-4 rounded-xl bg-zinc-800/60 p-3">
            <div className="text-xs text-zinc-400">我的邀请链接</div>
            <div className="mt-1 flex items-center gap-2">
              <input className="input flex-1 font-mono text-xs" value={inviteUrl} readOnly />
              <button onClick={() => { navigator.clipboard?.writeText(inviteUrl); toast.success('已复制'); }} className="btn-primary px-3 py-2">复制</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card icon={<Users className="h-5 w-5 text-amber-400" />} label="直推人数" value={stats?.directCount ?? 0} />
          <Card icon={<Users className="h-5 w-5 text-amber-400" />} label="团队总人数" value={stats?.totalTeam ?? 0} />
          <Card icon={<DollarSign className="h-5 w-5 text-emerald-400" />} label="累计佣金" value={`${formatNumber(stats?.totalCommission ?? 0, 2)} USDT`} />
          <Card icon={<TrendingUp className="h-5 w-5 text-emerald-400" />} label="今日佣金" value={`${formatNumber(stats?.todayCommission ?? 0, 2)} USDT`} />
        </div>

        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Award className="h-4 w-4 text-amber-400" /> 我的代理等级</h3>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-xl bg-zinc-800/60 p-3"><div className="text-zinc-400">L1 返佣率</div><div className="text-amber-400 text-lg font-semibold">{((stats?.l1Rate ?? 0) * 100).toFixed(2)}%</div></div>
            <div className="rounded-xl bg-zinc-800/60 p-3"><div className="text-zinc-400">L2 返佣率</div><div className="text-amber-400 text-lg font-semibold">{((stats?.l2Rate ?? 0) * 100).toFixed(2)}%</div></div>
            <div className="rounded-xl bg-zinc-800/60 p-3"><div className="text-zinc-400">L3 返佣率</div><div className="text-amber-400 text-lg font-semibold">{((stats?.l3Rate ?? 0) * 100).toFixed(2)}%</div></div>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold">我的下级 (一级 {team?.l1?.length ?? 0} 人 / 二级 {team?.l2?.length ?? 0} 人 / 三级 {team?.l3?.length ?? 0} 人)</h3>
          <div className="space-y-2">
            {(team?.l1 ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-zinc-800/40 px-3 py-2 text-sm">
                <div>
                  <div>{m.username}</div>
                  <div className="text-xs text-zinc-500">注册于 {formatDateTime(m.createdAt)}</div>
                </div>
                <div className="text-xs text-zinc-400">余额 {formatNumber(m.balance, 2)}</div>
              </div>
            ))}
            {!(team?.l1 ?? []).length && <div className="py-6 text-center text-zinc-500">暂无下级</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold">佣金明细</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400"><tr><th className="px-2 py-2 text-left">来源用户</th><th className="px-2 py-2 text-left">类型</th><th className="px-2 py-2 text-left">层级</th><th className="px-2 py-2 text-right">来源金额</th><th className="px-2 py-2 text-right">返佣</th><th className="px-2 py-2 text-right">时间</th></tr></thead>
              <tbody>
                {(commissions?.items ?? []).map((c: any) => (
                  <tr key={c.id} className="border-t border-zinc-800">
                    <td className="px-2 py-2">{c.fromUsername}</td>
                    <td className="px-2 py-2">{c.sourceType}</td>
                    <td className="px-2 py-2">L{c.level}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(c.sourceAmount, 2)}</td>
                    <td className="px-2 py-2 text-right text-emerald-400">+{formatNumber(c.commissionAmount, 4)}</td>
                    <td className="px-2 py-2 text-right text-zinc-400">{formatDateTime(c.createdAt)}</td>
                  </tr>
                ))}
                {!(commissions?.items ?? []).length && (
                  <tr><td colSpan={6} className="py-8 text-center text-zinc-500">暂无记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FeatureGate>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2">{icon}<span className="text-xs text-zinc-400">{label}</span></div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}
