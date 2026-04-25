import { request } from './api';

export interface PresignResp {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * 上传文件（含预签名直传到 S3/R2）
 *  - scope: kyc / avatar / ticket / blindbox
 *  - 返回 publicUrl 用于提交业务接口
 */
export async function uploadFile(
  file: File,
  scope: 'kyc' | 'avatar' | 'ticket' | 'blindbox'
): Promise<string> {
  if (!file) throw new Error('请选择文件');
  // 1) 申请预签名 URL
  const resp = await request<PresignResp>({
    url: '/upload/presign',
    method: 'POST',
    data: {
      scope,
      contentType: file.type,
      contentLength: file.size,
      filename: file.name,
    },
  });
  // 2) 直传到对象存储
  const r = await fetch(resp.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`上传失败 (${r.status}) ${text.slice(0, 100)}`);
  }
  return resp.publicUrl;
}

/** 选择文件并上传，返回 publicUrl */
export function pickAndUpload(scope: 'kyc' | 'avatar' | 'ticket' | 'blindbox', accept = 'image/*'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const url = await uploadFile(f, scope);
        resolve(url);
      } catch (e) {
        console.error(e);
        resolve(null);
      }
    };
    input.click();
  });
}
