import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, ShieldCheck, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { request } from '../lib/api';
import { uploadFile } from '../lib/upload';
import { useAuth } from '../store/auth';

interface KycApp {
  id: number;
  level: number;
  status: 'pending' | 'approved' | 'rejected' | 'resubmit';
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
interface KycStatus {
  kycLevel: number;
  kycStatus: string;
  applications: KycApp[];
}

const ID_TYPES = [
  { value: 'id_card', label: '身份证' },
  { value: 'passport', label: '护照' },
  { value: 'driver_license', label: '驾照' },
];

export default function Kyc() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const [form, setForm] = useState({
    level: 1 as 1 | 2,
    realName: '',
    idType: 'id_card' as 'id_card' | 'passport' | 'driver_license',
    idNumber: '',
    idFrontUrl: '',
    idBackUrl: '',
    selfieUrl: '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    void loadStatus();
  }, [user]);

  async function loadStatus() {
    try {
      setLoading(true);
      const data = await request<KycStatus>({ url: '/kyc/status' });
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(field: 'idFrontUrl' | 'idBackUrl' | 'selfieUrl', file: File) {
    try {
      setUploading(field);
      const url = await uploadFile(file, 'kyc');
      setForm((f) => ({ ...f, [field]: url }));
      toast.success('已上传');
    } catch (e: any) {
      toast.error(e?.message ?? '上传失败');
    } finally {
      setUploading(null);
    }
  }

  async function handleSubmit() {
    if (!form.realName || form.realName.length < 2) return toast.error('请填写真实姓名');
    if (!form.idNumber || form.idNumber.length < 4) return toast.error('请填写有效证件号');
    if (!form.idFrontUrl) return toast.error('请上传证件正面');
    try {
      setSubmitting(true);
      await request({ url: '/kyc/submit', method: 'POST', data: form });
      toast.success('已提交，等待审核');
      await loadStatus();
    } catch (e: any) {
      toast.error(e?.message ?? '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !status ||
    status.kycStatus === 'none' ||
    status.kycStatus === 'rejected' ||
    status.kycStatus === 'resubmit';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card">
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
          <ShieldCheck className="h-6 w-6 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold">实名认证 (KYC)</h2>
            <p className="text-xs text-zinc-400">完成认证后可解锁更高提现限额</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="text-xs text-zinc-500">当前等级</div>
            <div className="mt-1 text-base">L{status?.kycLevel ?? 0}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="text-xs text-zinc-500">状态</div>
            <div className="mt-1 flex items-center gap-1.5 text-base">
              <StatusIcon status={status?.kycStatus ?? 'none'} />
              <StatusLabel status={status?.kycStatus ?? 'none'} />
            </div>
          </div>
        </div>
      </div>

      {/* 历史申请 */}
      {status && status.applications.length > 0 && (
        <div className="card">
          <h3 className="mb-3 text-sm font-medium">申请历史</h3>
          <div className="space-y-2">
            {status.applications.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={a.status} />
                  <span>L{a.level}</span>
                  <span className="text-zinc-500">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-zinc-400">
                  <StatusLabel status={a.status} />
                  {a.reviewNote ? <span className="ml-2 text-zinc-500">- {a.reviewNote}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 申请表单 */}
      {canSubmit && (
        <div className="card space-y-4">
          <h3 className="text-sm font-medium">提交认证申请</h3>

          <Field label="认证等级">
            <select
              className="input"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: Number(e.target.value) as 1 | 2 })}
            >
              <option value={1}>L1 - 基础认证</option>
              <option value={2}>L2 - 高级认证</option>
            </select>
          </Field>

          <Field label="真实姓名">
            <input
              className="input"
              value={form.realName}
              onChange={(e) => setForm({ ...form, realName: e.target.value })}
              placeholder="与证件一致"
            />
          </Field>

          <Field label="证件类型">
            <select
              className="input"
              value={form.idType}
              onChange={(e) => setForm({ ...form, idType: e.target.value as any })}
            >
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="证件号码">
            <input
              className="input"
              value={form.idNumber}
              onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
              placeholder="请准确填写"
            />
          </Field>

          <UploadField
            label="证件正面"
            value={form.idFrontUrl}
            uploading={uploading === 'idFrontUrl'}
            onPick={(f) => handleUpload('idFrontUrl', f)}
            required
          />
          <UploadField
            label="证件背面"
            value={form.idBackUrl}
            uploading={uploading === 'idBackUrl'}
            onPick={(f) => handleUpload('idBackUrl', f)}
          />
          {form.level === 2 && (
            <UploadField
              label="手持证件自拍"
              value={form.selfieUrl}
              uploading={uploading === 'selfieUrl'}
              onPick={(f) => handleUpload('selfieUrl', f)}
              required
            />
          )}

          <button
            disabled={submitting}
            onClick={handleSubmit}
            className="btn-primary w-full disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              '提交审核'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function UploadField({
  label,
  value,
  uploading,
  onPick,
  required,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onPick: (f: File) => void;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {label}
          {required && <span className="ml-0.5 text-red-400">*</span>}
        </span>
      </div>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt={label} className="h-20 w-32 rounded-lg border border-zinc-700 object-cover" />
          <label className="btn-ghost cursor-pointer text-xs">
            <input
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
            />
            重新上传
          </label>
        </div>
      ) : (
        <label className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-xs text-zinc-400 hover:border-amber-400 hover:text-amber-400">
          <input
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="flex items-center gap-1">
              <Upload className="h-4 w-4" /> 点击上传
            </span>
          )}
        </label>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'approved') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === 'pending') return <Clock className="h-4 w-4 text-amber-400" />;
  return <ShieldCheck className="h-4 w-4 text-zinc-500" />;
}

function StatusLabel({ status }: { status: string }) {
  const map: Record<string, string> = {
    none: '未认证',
    pending: '审核中',
    approved: '已通过',
    rejected: '已拒绝',
    resubmit: '需重提交',
  };
  return <span>{map[status] ?? status}</span>;
}
