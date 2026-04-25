import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccessToken } from '../../lib/api';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  '如何充值 USDT？',
  '盲盒中奖率是怎么计算的？',
  '提现需要多久到账？',
  '我的账户被异常登录怎么办？',
];

export default function AiAssistantContent() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content: '你好！我是平台智能助手，可以解答规则与流程类问题。需要帮助吗？',
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const token = getAccessToken();
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`AI 服务异常 (${resp.status}) ${errText.slice(0, 100)}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: assistantContent };
                return copy;
              });
            }
          } catch {
            // ignore non-JSON keepalive
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        toast.error(e?.message ?? 'AI 调用失败');
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: '⚠️ 抱歉，回答失败，请稍后再试。' };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl flex-col rounded-xl border border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Sparkles className="h-5 w-5 text-amber-400" />
        <div>
          <div className="text-sm font-semibold">AI 智能助手</div>
          <div className="text-xs text-zinc-500">基于知识库回答规则类问题</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                m.role === 'user' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-amber-500/10 text-amber-100'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-100'
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : null)}
            </div>
          </div>
        ))}

        {/* 起始问题 */}
        {messages.length <= 1 && !streaming && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="rounded-lg border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-300 hover:border-amber-400 hover:text-amber-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[44px] flex-1 resize-none"
            rows={1}
            placeholder="输入问题，Shift+Enter 换行"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
          />
          <button
            onClick={() => void send(input)}
            disabled={streaming || !input.trim()}
            className="btn-primary h-11 px-4 disabled:opacity-50"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 text-[10px] text-zinc-500">
          AI 助手不提供投资建议；账户/资金问题请提交工单。
        </div>
      </div>
    </div>
  );
}
