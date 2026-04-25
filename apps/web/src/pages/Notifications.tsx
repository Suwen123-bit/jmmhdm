import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { request } from '../lib/api';
import { formatDateTime } from '../lib/utils';

export default function Notifications() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<{ items: any[]; total: number }>({ url: '/user/notifications', params: { page: 1, pageSize: 50 } }),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => request({ url: `/user/notifications/${id}/read`, method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => request({ url: '/user/notifications/read-all', method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Bell className="h-5 w-5" /> 站内通知</h1>
        <button onClick={() => markAllRead.mutate()} className="btn-ghost px-3 py-1 text-sm"><Check className="mr-1 h-4 w-4" /> 全部已读</button>
      </div>
      <div className="space-y-2">
        {(data?.items ?? []).map((n) => (
          <div
            key={n.id}
            onClick={() => !n.read && markRead.mutate(n.id)}
            className={`card cursor-pointer ${n.read ? 'opacity-60' : 'border-amber-500/30'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{n.title}</div>
                <div className="mt-1 text-sm text-zinc-300">{n.content}</div>
              </div>
              {!n.read && <span className="mt-1 h-2 w-2 rounded-full bg-amber-400" />}
            </div>
            <div className="mt-2 text-xs text-zinc-500">{formatDateTime(n.createdAt)}</div>
          </div>
        ))}
        {!(data?.items ?? []).length && <div className="py-10 text-center text-zinc-500">暂无通知</div>}
      </div>
    </div>
  );
}
