import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { request } from './api';

export function passkeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * 已登录场景：注册当前账户的新 Passkey
 */
export async function registerPasskey(deviceName?: string): Promise<{ credentialId: string }> {
  const { options, sessionToken } = await request<{
    options: any;
    sessionToken: string;
  }>({
    method: 'POST',
    url: '/passkey/register/options',
  });
  const response = await startRegistration({ optionsJSON: options });
  const r = await request<{ credentialId: string }>({
    method: 'POST',
    url: '/passkey/register/verify',
    data: { sessionToken, response, deviceName },
  });
  return r;
}

/**
 * 未登录场景：使用 Passkey 登录
 */
export async function loginWithPasskey(username?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: any;
}> {
  const { options, sessionToken } = await request<{
    options: any;
    sessionToken: string;
  }>({
    method: 'POST',
    url: '/passkey/login/options',
    data: { username },
  });
  const response = await startAuthentication({ optionsJSON: options });
  const r = await request<{
    accessToken: string;
    refreshToken: string;
    user: any;
  }>({
    method: 'POST',
    url: '/passkey/login/verify',
    data: { sessionToken, response },
  });
  return r;
}

export async function listPasskeys() {
  return request<{ items: any[] }>({ method: 'GET', url: '/passkey/list' });
}

export async function deletePasskey(id: number) {
  return request({ method: 'DELETE', url: `/passkey/${id}` });
}
