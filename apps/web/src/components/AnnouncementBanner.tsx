import { useEffect, useState } from 'react';
import { X, Info, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { request } from '../lib/api';

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'critical';
  priority: number;
}

const ICONS = {
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  critical: <AlertOctagon className="h-4 w-4" />,
};

const COLORS: Record<string, string> = {
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  success: 'bg-green-500/10 border-green-500/30 text-green-200',
  critical: 'bg-red-500/10 border-red-500/30 text-red-200',
};

export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('app.dismissed_announcements') ?? '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    void (async () => {
      try {
        const r = await request<{ items: Announcement[] }>({ url: '/config/announcements' });
        setItems(r.items ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  function dismiss(id: number) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem('app.dismissed_announcements', JSON.stringify([...next]));
    } catch {
      // ignore
    }
  }

  const visible = items.filter((it) => !dismissed.has(it.id));
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2">
      {visible.map((it) => (
        <div
          key={it.id}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${COLORS[it.type] ?? COLORS.info}`}
        >
          <span className="mt-0.5">{ICONS[it.type] ?? ICONS.info}</span>
          <div className="flex-1">
            <div className="font-semibold">{it.title}</div>
            <div className="mt-0.5 whitespace-pre-wrap opacity-90">{it.content}</div>
          </div>
          <button onClick={() => dismiss(it.id)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
