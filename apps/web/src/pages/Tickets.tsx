import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Plus, X } from 'lucide-react';
import { request } from '../lib/api';
import { formatDateTime } from '../lib/utils';

const STATUS_LABELS: Record<string, string> = {
  open: '处理中',
  pending: '等待回复',
  closed: '已关闭',
  resolved: '已解决',
};

const TYPE_LABELS: Record<string, string> = {
  general: '其他咨询',
  deposit: '充值问题',
  withdraw: '提现问题',
  trade: '交易问题',
  account: '账户问题',
  bug: '故障反馈',
};

export default function Tickets() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState({ type: 'general', subject: '', content: '', priority: 'normal' as const });
  const [reply, setReply] = useState('');

  const { data: list } = useQuery({
    queryKey: ['tickets', 'list'],
    queryFn: () => request<{ items: any[] }>({ url: '/ticket/list', params: { page: 1, pageSize: 30 } }),
  });

  const { data: detail } = useQuery({
    queryKey: ['tickets', 'detail', activeId],
    queryFn: () => request<any>({ url: `/ticket/detail/${activeId}` }),
    enabled: !!activeId,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => request({ url: '/ticket/create', method: 'POST', data: form }),
    onSuccess: () => {
      toast.success('工单已提交');
      setOpenCreate(false);
      setForm({ type: 'general', subject: '', content: '', priority: 'normal' });
      qc.invalidateQueries({ queryKey: ['tickets', 'list'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replyMutation = useMutation({
    mutationFn: () => request({ url: '/ticket/reply', method: 'POST', data: { ticketId: activeId, content: reply } }),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['tickets', 'detail', activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><MessageSquare className="h-5 w-5" /> 我的工单</h1>
        <button onClick={() => setOpenCreate(true)} className="btn-primary"><Plus className="mr-1 h-4 w-4" />新建工单</button>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="card max-h-[70vh] space-y-2 overflow-y-auto">
          {(list?.items ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`w-full rounded-xl border p-3 text-left ${activeId === t.id ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{t.subject}</span>
                <span className="text-xs text-amber-400">{STATUS_LABELS[t.status] ?? t.status}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-400">{TYPE_LABELS[t.type] ?? t.type} · {formatDateTime(t.createdAt)}</div>
            </button>
          ))}
          {!(list?.items ?? []).length && <div className="py-10 text-center text-zinc-500">暂无工单</div>}
        </div>

        <div className="card">
          {!detail ? (
            <div className="py-20 text-center text-zinc-500">请选择左侧工单</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-zinc-800 pb-3">
                <div className="text-lg font-semibold">{detail.subject}</div>
                <div className="mt-1 text-xs text-zinc-400">{TYPE_LABELS[detail.type] ?? detail.type} · {STATUS_LABELS[detail.status] ?? detail.status}</div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {(detail.replies ?? []).map((r: any) => (
                  <div key={r.id} className={`rounded-xl p-3 ${r.senderType === 'admin' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-800/40'}`}>
                    <div className="mb-1 text-xs text-zinc-400">
                      {r.senderType === 'admin' ? '客服' : '我'} · {formatDateTime(r.createdAt)}
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{r.content}</div>
                  </div>
                ))}
              </div>
              {detail.status !== 'closed' && (
                <div className="border-t border-zinc-800 pt-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="输入回复内容…"
                    className="input min-h-[80px]"
                  />
                  <button
                    onClick={() => reply.trim() && replyMutation.mutate()}
                    disabled={!reply.trim() || replyMutation.isPending}
                    className="btn-primary mt-2 w-full"
                  >
                    {replyMutation.isPending ? '发送中…' : '发送回复'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpenCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">新建工单</h3>
              <button onClick={() => setOpenCreate(false)} className="text-zinc-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">类型</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">标题</label>
                <input className="input" maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">详细描述</label>
                <textarea className="input min-h-[120px]" maxLength={5000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.subject || !form.content || createMutation.isPending}
                className="btn-primary w-full"
              >
                {createMutation.isPending ? '提交中…' : '提交工单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
