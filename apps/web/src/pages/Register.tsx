import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { request } from '../lib/api';
import toast from 'react-hot-toast';

export default function Register() {
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState(params.get('invite') ?? '');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreementVersions, setAgreementVersions] = useState<{ terms?: string; privacy?: string; risk?: string }>({});
  const [loading, setLoading] = useState(false);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const r = await request<Record<string, { version: string | null }>>({ url: '/agreement/current' });
        setAgreementVersions({
          terms: r.terms?.version ?? '1.0',
          privacy: r.privacy?.version ?? '1.0',
          risk: r.risk?.version ?? '1.0',
        });
      } catch {
        setAgreementVersions({ terms: '1.0', privacy: '1.0', risk: '1.0' });
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('两次密码输入不一致');
      return;
    }
    if (!agreeTerms || !agreeRisk) {
      toast.error('请先阅读并同意用户协议与风险揭示');
      return;
    }
    setLoading(true);
    try {
      await register({ username, email, password, inviteCode: inviteCode || undefined });
      // 注册成功后立即落库三份协议接受记录（后端已登录态）
      try {
        await Promise.all([
          request({ url: '/agreement/accept', method: 'POST', data: { agreementType: 'terms', version: agreementVersions.terms ?? '1.0' } }),
          request({ url: '/agreement/accept', method: 'POST', data: { agreementType: 'privacy', version: agreementVersions.privacy ?? '1.0' } }),
          request({ url: '/agreement/accept', method: 'POST', data: { agreementType: 'risk', version: agreementVersions.risk ?? '1.0' } }),
        ]);
      } catch {
        // 接受失败不阻断注册流程
      }
      toast.success('注册成功');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">创建账户</h1>
          <p className="mt-1 text-sm text-zinc-400">注册即可开启交易</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">用户名</label>
          <input aria-label="用户名" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">邮箱</label>
          <input aria-label="邮箱" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">密码</label>
          <input aria-label="密码" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">确认密码</label>
          <input aria-label="确认密码" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">邀请码 (可选)</label>
          <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
        </div>
        <div className="space-y-2 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-300">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
            <span>
              我已阅读并同意
              <a href={`/agreement/view?type=terms&version=${agreementVersions.terms ?? '1.0'}`} target="_blank" rel="noreferrer" className="mx-1 text-amber-400 hover:underline">《用户协议》</a>
              和
              <a href={`/agreement/view?type=privacy&version=${agreementVersions.privacy ?? '1.0'}`} target="_blank" rel="noreferrer" className="mx-1 text-amber-400 hover:underline">《隐私政策》</a>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={agreeRisk} onChange={(e) => setAgreeRisk(e.target.checked)} />
            <span>
              我已知悉
              <a href={`/agreement/view?type=risk&version=${agreementVersions.risk ?? '1.0'}`} target="_blank" rel="noreferrer" className="mx-1 text-amber-400 hover:underline">《风险揭示》</a>
              并自愿承担由交易/盲盒产生的全部损失
            </span>
          </label>
        </div>
        <button type="submit" className="btn-primary w-full py-3" disabled={loading || !agreeTerms || !agreeRisk}>
          {loading ? '注册中…' : '注册'}
        </button>
        <div className="text-center text-sm text-zinc-400">
          已有账户？ <Link to="/login" className="text-amber-400 hover:underline">立即登录</Link>
        </div>
      </form>
    </div>
  );
}
