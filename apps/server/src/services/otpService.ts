import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userTotp, users } from '../db/schema.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';

authenticator.options = { window: 1, step: 30 };

export async function generateTotpSecret(userId: number, issuer = 'CryptoPlatform') {
  const u = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u[0]) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(u[0].email, issuer, secret);
  const qrcode = await QRCode.toDataURL(otpauth);

  await db
    .insert(userTotp)
    .values({ userId, secretEncrypted: encrypt(secret), enabled: false })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: { secretEncrypted: encrypt(secret), enabled: false },
    });

  return { secret, otpauth, qrcode };
}

export async function enableTotp(userId: number, code: string): Promise<void> {
  const row = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
  if (!row[0]) throw new AppError('TOTP_NOT_INITIALIZED', '请先生成二步验证密钥', 400);
  const secret = decrypt(row[0].secretEncrypted);
  if (!authenticator.verify({ token: code, secret })) {
    throw new AppError('TOTP_INVALID', '验证码错误', 400);
  }
  await db.update(userTotp).set({ enabled: true }).where(eq(userTotp.userId, userId));
}

export async function disableTotp(userId: number, code: string): Promise<void> {
  await verifyTotp(userId, code, true);
  await db.delete(userTotp).where(eq(userTotp.userId, userId));
}

export async function verifyTotp(
  userId: number,
  code: string,
  required = false
): Promise<boolean> {
  const row = await db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
  if (!row[0] || !row[0].enabled) {
    if (required) throw new AppError('TOTP_NOT_ENABLED', '未开启二步验证', 400);
    return true; // 未开启则认为通过
  }
  const secret = decrypt(row[0].secretEncrypted);
  const ok = authenticator.verify({ token: code, secret });
  if (!ok) throw new AppError('TOTP_INVALID', '二步验证码错误', 400);
  return true;
}

export async function isTotpEnabled(userId: number): Promise<boolean> {
  const row = await db
    .select({ enabled: userTotp.enabled })
    .from(userTotp)
    .where(eq(userTotp.userId, userId))
    .limit(1);
  return !!row[0]?.enabled;
}
