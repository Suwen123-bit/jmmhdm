import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Shield, Key, FileText, Fingerprint, Languages } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { formatDateTime } from '../lib/utils';
import {
  passkeySupported,
  registerPasskey,
  listPasskeys,
  deletePasskey,
} from '../lib/passkey';

export default function Profile() {
  const user = useAuth((s) => s.user);
  const fetchMe = useAuth((s) => s.fetchMe);
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const supportsPk = passkeySupported();
  const [pkDeviceName, setPkDeviceName] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [fundPwd, setFundPwd] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [totp, setTotp] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  const { data: loginLogs } = useQuery({
    queryKey: ['login-logs'],
    queryFn: () => request<{ items: any[] }>({ url: '/user/login-logs', params: { page: 1, pageSize: 10 } }),
  });

  const { data: passkeys } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => listPasskeys(),
    enabled: supportsPk,
  });

  const addPasskey = useMutation({
    mutationFn: () => registerPasskey(pkDeviceName || undefined),
    onSuccess: () => {
      toast.success('Passkey 已添加');
      setPkDeviceName('');
      void qc.invalidateQueries({ queryKey: ['passkeys'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Passkey 注册失败'),
  });

  const removePasskey = useMutation({
    mutationFn: (id: number) => deletePasskey(id),
    onSuccess: () => {
      toast.success('Passkey 已移除');
      void qc.invalidateQueries({ queryKey: ['passkeys'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchLang = (lng: 'zh-CN' | 'en') => {
    void i18n.changeLanguage(lng);
    toast.success(lng === 'zh-CN' ? '已切换为简体中文' : 'Switched to English');
  };

  const changePwd = useMutation({
    mutationFn: () => request({ url: '/auth/change-password', method: 'POST', data: { oldPassword: oldPwd, newPassword: newPwd } }),
    onSuccess: () => {
      toast.success('密码已更新');
      setOldPwd('');
      setNewPwd('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFundPwdMutation = useMutation({
    mutationFn: () => request({ url: '/auth/set-fund-password', method: 'POST', data: { fundPassword: fundPwd, loginPassword: loginPwd } }),
    onSuccess: () => {
      toast.success('资金密码已设置');
      setFundPwd('');
      setLoginPwd('');
      void fetchMe();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setupTotp = useMutation({
    mutationFn: () => request<{ secret: string; otpauthUrl: string }>({ url: '/user/totp/setup', method: 'POST' }),
    onSuccess: (data) => setTotp(data),
    onError: (e: Error) => toast.error(e.message),
  });

  const enableTotp = useMutation({
    mutationFn: () => request({ url: '/user/totp/enable', method: 'POST', data: { code: totpCode } }),
    onSuccess: () => {
      toast.success('2FA 已启用');
      setTotp(null);
      setTotpCode('');
      void fetchMe();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableTotp = useMutation({
    mutationFn: () => request({ url: '/user/totp/disable', method: 'POST', data: { code: totpCode } }),
    onSuccess: () => {
      toast.success('2FA 已关闭');
      setTotpCode('');
      void fetchMe();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;
  const inviteUrl = `${window.location.origin}/register?invite=${user.inviteCode}`;

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="text-xl font-semibold">{user.username}</h1>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div><div className="text-zinc-400">邮箱</div><div>{user.email}</div></div>
          <div><div className="text-zinc-400">角色</div><div>{user.role}</div></div>
          <div><div className="text-zinc-400">语言</div><div>{user.language}</div></div>
          <div><div className="text-zinc-400">注册时间</div><div>{formatDateTime(user.createdAt)}</div></div>
        </div>
        <div className="mt-3 rounded-xl bg-zinc-800/60 p-3 text-sm">
          <div className="text-zinc-400">我的邀请码</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded bg-zinc-900 px-2 py-1">{user.inviteCode}</code>
            <button onClick={() => { navigator.clipboard?.writeText(inviteUrl); toast.success('已复制邀请链接'); }} className="btn-ghost px-3 py-1 text-xs">复制邀请链接</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Key className="h-4 w-4" /> 修改登录密码</h3>
          <div className="space-y-3">
            <input type="password" placeholder="原密码" className="input" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
            <input type="password" placeholder="新密码 (至少 8 位)" className="input" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            <button onClick={() => changePwd.mutate()} disabled={!oldPwd || !newPwd || changePwd.isPending} className="btn-primary w-full">{changePwd.isPending ? '提交中…' : '更新密码'}</button>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Key className="h-4 w-4" /> 设置资金密码</h3>
          {user.hasFundPassword && <div className="mb-2 text-xs text-emerald-400">✓ 资金密码已设置（重新设置将覆盖）</div>}
          <div className="space-y-3">
            <input type="password" placeholder="资金密码 (6-32 位)" className="input" value={fundPwd} onChange={(e) => setFundPwd(e.target.value)} />
            <input type="password" placeholder="登录密码 (验证身份)" className="input" value={loginPwd} onChange={(e) => setLoginPwd(e.target.value)} />
            <button onClick={() => setFundPwdMutation.mutate()} disabled={!fundPwd || !loginPwd || setFundPwdMutation.isPending} className="btn-primary w-full">{setFundPwdMutation.isPending ? '提交中…' : '保存'}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Shield className="h-4 w-4" /> 二步验证 (2FA)</h3>
        {!user.totpEnabled && !totp && (
          <button onClick={() => setupTotp.mutate()} disabled={setupTotp.isPending} className="btn-primary">开始绑定 Authenticator</button>
        )}
        {!user.totpEnabled && totp && (
          <div className="space-y-3">
            <div className="rounded-xl bg-zinc-800/60 p-3 text-sm">
              <div>请使用 Google Authenticator / Authy 扫描二维码或手动输入密钥：</div>
              <code className="mt-2 block break-all rounded bg-zinc-900 p-2">{totp.secret}</code>
              <div className="mt-2 break-all text-xs text-zinc-400">{totp.otpauthUrl}</div>
            </div>
            <input className="input tracking-widest" maxLength={6} placeholder="输入 6 位验证码" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} />
            <button onClick={() => enableTotp.mutate()} disabled={!totpCode || enableTotp.isPending} className="btn-primary w-full">确认启用</button>
          </div>
        )}
        {user.totpEnabled && (
          <div className="space-y-3">
            <div className="text-sm text-emerald-400">✓ 2FA 已启用</div>
            <input className="input tracking-widest" maxLength={6} placeholder="输入 6 位验证码以关闭" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} />
            <button onClick={() => disableTotp.mutate()} disabled={!totpCode || disableTotp.isPending} className="btn-ghost w-full">关闭 2FA</button>
          </div>
        )}
      </div>

      {supportsPk && (
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Fingerprint className="h-4 w-4" /> Passkey 安全密钥
          </h3>
          <div className="space-y-2">
            {(passkeys?.items ?? []).length === 0 && (
              <div className="text-sm text-zinc-500">您还没有添加任何 Passkey</div>
            )}
            {(passkeys?.items ?? []).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{p.deviceName ?? '未命名设备'}</div>
                  <div className="text-xs text-zinc-500">
                    添加于 {formatDateTime(p.createdAt)}
                    {p.lastUsedAt && ` · 上次使用 ${formatDateTime(p.lastUsedAt)}`}
                  </div>
                </div>
                <button
                  onClick={() => removePasskey.mutate(p.id)}
                  disabled={removePasskey.isPending}
                  className="btn-ghost px-3 py-1 text-xs text-red-400"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="input flex-1"
              placeholder="设备名称（如：MacBook Pro）"
              value={pkDeviceName}
              onChange={(e) => setPkDeviceName(e.target.value)}
            />
            <button
              onClick={() => addPasskey.mutate()}
              disabled={addPasskey.isPending}
              className="btn-primary"
            >
              {addPasskey.isPending ? '添加中…' : '添加 Passkey'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Languages className="h-4 w-4" /> 语言 / Language
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => switchLang('zh-CN')}
            className={
              i18n.language?.startsWith('zh') ? 'btn-primary px-4' : 'btn-ghost px-4'
            }
          >
            简体中文
          </button>
          <button
            onClick={() => switchLang('en')}
            className={
              i18n.language?.startsWith('en') ? 'btn-primary px-4' : 'btn-ghost px-4'
            }
          >
            English
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> 最近登录记录</h3>
        <div className="space-y-1.5">
          {(loginLogs?.items ?? []).map((log) => (
            <div key={log.id} className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-3 py-2 text-xs">
              <span className="text-zinc-300">{log.ip} · {log.userAgent?.slice(0, 60)}</span>
              <span className="text-zinc-500">{formatDateTime(log.createdAt)}</span>
            </div>
          ))}
          {!(loginLogs?.items ?? []).length && <div className="py-4 text-center text-zinc-500 text-sm">暂无记录</div>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Link to="/inventory" className="card hover:border-amber-500/40">📦 我的盲盒库存</Link>
        <Link to="/tickets" className="card hover:border-amber-500/40">💬 我的工单</Link>
        <Link to="/notifications" className="card hover:border-amber-500/40">🔔 站内通知</Link>
      </div>
    </div>
  );
}
