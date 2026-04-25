import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import toast from 'react-hot-toast';
import { setTokens } from '../lib/api';
import { passkeySupported, loginWithPasskey } from '../lib/passkey';

export default function Login() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const supportsPasskey = passkeySupported();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await login(account, password, totpCode || undefined);
      if (res.totpRequired) {
        setNeedTotp(true);
        toast.success('请输入二步验证码');
      } else {
        toast.success('登录成功');
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err?.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const onPasskey = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await loginWithPasskey(account || undefined);
      setTokens(r.accessToken, r.refreshToken);
      setUser(r.user as any);
      toast.success('Passkey 登录成功');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Passkey 登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold">欢迎回来</h1>
          <p className="mt-1 text-sm text-zinc-400">登录您的账户</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">用户名 / 邮箱</label>
          <input
            className="input"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">密码</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {needTotp && (
          <div>
            <label className="mb-1 block text-sm text-zinc-300">二步验证码</label>
            <input
              className="input tracking-widest"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
        )}
        <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
        {supportsPasskey && (
          <>
            <div className="relative my-2 flex items-center">
              <div className="flex-1 border-t border-zinc-800" />
              <span className="px-3 text-xs text-zinc-500">或</span>
              <div className="flex-1 border-t border-zinc-800" />
            </div>
            <button
              type="button"
              onClick={onPasskey}
              disabled={loading}
              className="btn-ghost w-full py-3"
            >
              使用 Passkey 登录
            </button>
          </>
        )}
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <Link to="/register" className="hover:text-amber-400">
            立即注册
          </Link>
          <Link to="/" className="hover:text-amber-400">
            返回首页
          </Link>
        </div>
      </form>
    </div>
  );
}
