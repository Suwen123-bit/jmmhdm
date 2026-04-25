import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request } from '../lib/api';

const TYPE_TITLE: Record<string, string> = {
  terms: '用户协议',
  privacy: '隐私政策',
  risk: '风险揭示',
};

export default function AgreementView() {
  const [params] = useSearchParams();
  const type = params.get('type') ?? 'terms';
  const version = params.get('version') ?? '1.0';
  const [content, setContent] = useState<string>('加载中…');

  useEffect(() => {
    void (async () => {
      try {
        const r = await request<{ content: string }>({
          url: `/agreement/content?type=${encodeURIComponent(type)}&version=${encodeURIComponent(version)}`,
        });
        setContent(r.content || '该协议尚未发布。');
      } catch (e: any) {
        setContent('加载失败：' + (e?.message ?? ''));
      }
    })();
  }, [type, version]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-zinc-200">
      <h1 className="mb-2 text-2xl font-semibold">{TYPE_TITLE[type] ?? '协议'}</h1>
      <p className="mb-6 text-xs text-zinc-500">版本：{version}</p>
      <article
        className="prose prose-invert max-w-none whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
