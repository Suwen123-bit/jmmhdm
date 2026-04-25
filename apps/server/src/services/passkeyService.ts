import { eq, and, gt } from 'drizzle-orm';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';

// JSON 响应载荷类型在 v11 SDK 中通过子包导出，避免根路径引用问题，统一用结构性类型
type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: string[];
  };
  type: string;
  clientExtensionResults?: any;
};
type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  type: string;
  clientExtensionResults?: any;
};
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { passkeys, passkeyChallenges, users } from '../db/schema.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 分钟

async function storeChallenge(opts: {
  userId: number | null;
  challenge: string;
  type: 'register' | 'login';
}): Promise<string> {
  const sessionToken = nanoid(32);
  await db.insert(passkeyChallenges).values({
    userId: opts.userId,
    sessionToken,
    challenge: opts.challenge,
    type: opts.type,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return sessionToken;
}

async function consumeChallenge(
  sessionToken: string,
  type: 'register' | 'login'
): Promise<{ challenge: string; userId: number | null }> {
  const rows = await db
    .select()
    .from(passkeyChallenges)
    .where(
      and(
        eq(passkeyChallenges.sessionToken, sessionToken),
        eq(passkeyChallenges.type, type),
        gt(passkeyChallenges.expiresAt, new Date())
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError('PASSKEY_CHALLENGE_INVALID', '挑战已过期或不存在', 400);
  // 一次性使用：消费后立即删除
  await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, row.id));
  return { challenge: row.challenge, userId: row.userId };
}

/**
 * 注册：生成 attestation options
 */
export async function buildRegisterOptions(userId: number) {
  const u = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);

  const existing = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));

  const options = await generateRegistrationOptions({
    rpName: env.PASSKEY_RP_NAME,
    rpID: env.PASSKEY_RP_ID,
    userName: u[0].username,
    userDisplayName: u[0].username,
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: (p.transports as string[] | null) ?? undefined,
    })) as any,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  const sessionToken = await storeChallenge({
    userId,
    challenge: options.challenge,
    type: 'register',
  });
  return { options, sessionToken };
}

/**
 * 注册：校验 attestation response
 */
export async function verifyRegister(opts: {
  userId: number;
  sessionToken: string;
  response: RegistrationResponseJSON;
  deviceName?: string;
}) {
  const { challenge, userId: storedUid } = await consumeChallenge(
    opts.sessionToken,
    'register'
  );
  if (storedUid !== opts.userId) {
    throw new AppError('PASSKEY_USER_MISMATCH', '会话用户不匹配', 400);
  }
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: opts.response as any,
      expectedChallenge: challenge,
      expectedOrigin: env.PASSKEY_ORIGIN,
      expectedRPID: env.PASSKEY_RP_ID,
      requireUserVerification: false,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, '[passkey] register verification failed');
    throw new AppError('PASSKEY_VERIFICATION_FAILED', e?.message ?? '验证失败', 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError('PASSKEY_VERIFICATION_FAILED', '验证未通过', 400);
  }
  const info = verification.registrationInfo;
  const credential: any = (info as any).credential ?? info;
  const credentialId: string =
    typeof credential.id === 'string'
      ? credential.id
      : Buffer.from(credential.credentialID ?? credential.id).toString('base64url');
  const publicKey: string =
    typeof credential.publicKey === 'string'
      ? credential.publicKey
      : Buffer.from(credential.credentialPublicKey ?? credential.publicKey).toString('base64url');
  const counter: number = credential.counter ?? 0;

  await db.insert(passkeys).values({
    userId: opts.userId,
    credentialId,
    publicKey,
    counter,
    transports: opts.response.response.transports ?? [],
    deviceName: opts.deviceName ?? null,
    backedUp: (info as any).credentialBackedUp ?? false,
  });
  return { success: true, credentialId };
}

/**
 * 登录：生成 assertion options（用户名可选；不指定则发现式登录）
 */
export async function buildLoginOptions(opts: { username?: string }) {
  let userId: number | null = null;
  let allowCredentials: any[] | undefined;
  if (opts.username) {
    const u = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, opts.username))
      .limit(1);
    if (u[0]) {
      userId = u[0].id;
      const creds = await db
        .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
        .from(passkeys)
        .where(eq(passkeys.userId, userId));
      allowCredentials = creds.map((p) => ({
        id: p.credentialId,
        transports: (p.transports as string[] | null) ?? undefined,
      }));
    }
  }
  const options = await generateAuthenticationOptions({
    rpID: env.PASSKEY_RP_ID,
    userVerification: 'preferred',
    allowCredentials: allowCredentials as any,
  });
  const sessionToken = await storeChallenge({
    userId,
    challenge: options.challenge,
    type: 'login',
  });
  return { options, sessionToken };
}

/**
 * 登录：校验 assertion response，返回匹配到的 userId
 */
export async function verifyLogin(opts: {
  sessionToken: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: number; credentialId: string }> {
  const { challenge } = await consumeChallenge(opts.sessionToken, 'login');

  const credentialIdB64 = opts.response.id;
  const rows = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, credentialIdB64))
    .limit(1);
  const stored = rows[0];
  if (!stored) throw new AppError('PASSKEY_NOT_FOUND', 'Passkey 不存在', 404);

  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response: opts.response as any,
      expectedChallenge: challenge,
      expectedOrigin: env.PASSKEY_ORIGIN,
      expectedRPID: env.PASSKEY_RP_ID,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.publicKey, 'base64url'),
        counter: stored.counter,
        transports: (stored.transports as any) ?? undefined,
      } as any,
      requireUserVerification: false,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, '[passkey] login verification failed');
    throw new AppError('PASSKEY_VERIFICATION_FAILED', e?.message ?? '验证失败', 401);
  }
  if (!verification.verified) {
    throw new AppError('PASSKEY_VERIFICATION_FAILED', '验证未通过', 401);
  }

  // 更新 counter 防重放
  await db
    .update(passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(passkeys.id, stored.id));

  return { userId: stored.userId, credentialId: credentialIdB64 };
}

/**
 * 列出用户的 Passkey
 */
export async function listUserPasskeys(userId: number) {
  return db
    .select({
      id: passkeys.id,
      credentialId: passkeys.credentialId,
      deviceName: passkeys.deviceName,
      backedUp: passkeys.backedUp,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
}

export async function deletePasskey(userId: number, passkeyId: number) {
  await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));
  return { success: true };
}
