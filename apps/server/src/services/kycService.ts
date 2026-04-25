import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { kycApplications, users } from '../db/schema.js';
import { AppError } from '../middleware/errorHandler.js';
import type { KycSubmitInput } from '@app/shared';
import { logger } from '../logger.js';

/**
 * 用户提交 KYC 申请
 * - 不允许已通过的级别再次提交相同 level
 * - 已存在 pending 申请则覆盖（更新而非新建）
 */
export async function submitKyc(userId: number, input: KycSubmitInput) {
  const userRow = await db
    .select({ kycLevel: users.kycLevel, kycStatus: users.kycStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRow[0];
  if (!user) throw new AppError('USER_NOT_FOUND', '用户不存在', 404);
  if ((user.kycLevel ?? 0) >= input.level && user.kycStatus === 'approved') {
    throw new AppError('KYC_ALREADY_APPROVED', '已通过该级别认证', 400);
  }

  // 是否有 pending 申请
  const existing = await db
    .select()
    .from(kycApplications)
    .where(
      and(
        eq(kycApplications.userId, userId),
        eq(kycApplications.level, input.level),
        eq(kycApplications.status, 'pending')
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(kycApplications)
      .set({
        realName: input.realName,
        idType: input.idType,
        idNumber: input.idNumber,
        idFrontUrl: input.idFrontUrl,
        idBackUrl: input.idBackUrl ?? null,
        selfieUrl: input.selfieUrl ?? null,
      })
      .where(eq(kycApplications.id, existing[0].id));
    return { id: existing[0].id, status: 'pending' };
  }

  const inserted = await db
    .insert(kycApplications)
    .values({
      userId,
      level: input.level,
      realName: input.realName,
      idType: input.idType,
      idNumber: input.idNumber,
      idFrontUrl: input.idFrontUrl,
      idBackUrl: input.idBackUrl ?? null,
      selfieUrl: input.selfieUrl ?? null,
      status: 'pending',
    })
    .returning({ id: kycApplications.id });

  // 同步 users.kycStatus 为 pending
  await db.update(users).set({ kycStatus: 'pending' }).where(eq(users.id, userId));

  return { id: inserted[0]!.id, status: 'pending' };
}

/**
 * 用户查询自己的 KYC 状态
 */
export async function getKycStatus(userId: number) {
  const apps = await db
    .select()
    .from(kycApplications)
    .where(eq(kycApplications.userId, userId))
    .orderBy(desc(kycApplications.createdAt))
    .limit(5);
  const userRow = await db
    .select({ kycLevel: users.kycLevel, kycStatus: users.kycStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    kycLevel: userRow[0]?.kycLevel ?? 0,
    kycStatus: userRow[0]?.kycStatus ?? 'none',
    applications: apps.map((a) => ({
      id: a.id,
      level: a.level,
      status: a.status,
      reviewNote: a.reviewNote,
      createdAt: a.createdAt,
      reviewedAt: a.reviewedAt,
    })),
  };
}

/**
 * 管理后台：分页列出 KYC 申请
 */
export async function listKycApplications(opts: {
  status?: string;
  page: number;
  pageSize: number;
}) {
  const offset = (opts.page - 1) * opts.pageSize;
  const where = opts.status ? eq(kycApplications.status, opts.status) : undefined;
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: kycApplications.id,
        userId: kycApplications.userId,
        username: users.username,
        level: kycApplications.level,
        status: kycApplications.status,
        realName: kycApplications.realName,
        idType: kycApplications.idType,
        idNumber: kycApplications.idNumber,
        idFrontUrl: kycApplications.idFrontUrl,
        idBackUrl: kycApplications.idBackUrl,
        selfieUrl: kycApplications.selfieUrl,
        reviewNote: kycApplications.reviewNote,
        createdAt: kycApplications.createdAt,
        reviewedAt: kycApplications.reviewedAt,
      })
      .from(kycApplications)
      .leftJoin(users, eq(users.id, kycApplications.userId))
      .where(where ?? sql`true`)
      .orderBy(desc(kycApplications.createdAt))
      .limit(opts.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(kycApplications)
      .where(where ?? sql`true`),
  ]);
  return { items, total: totalRow[0]?.count ?? 0, page: opts.page, pageSize: opts.pageSize };
}

/**
 * 管理后台：审核通过/拒绝
 */
export async function reviewKyc(opts: {
  applicationId: number;
  reviewerId: number;
  action: 'approve' | 'reject';
  note?: string;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(kycApplications)
      .where(eq(kycApplications.id, opts.applicationId))
      .for('update')
      .limit(1);
    const app = rows[0];
    if (!app) throw new AppError('KYC_NOT_FOUND', 'KYC 申请不存在', 404);
    if (app.status !== 'pending') throw new AppError('KYC_NOT_PENDING', '该申请已审核', 400);

    const newStatus = opts.action === 'approve' ? 'approved' : 'rejected';
    await tx
      .update(kycApplications)
      .set({
        status: newStatus,
        reviewedBy: opts.reviewerId,
        reviewNote: opts.note ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(kycApplications.id, opts.applicationId));

    // 同步用户表的 kycLevel / kycStatus
    if (opts.action === 'approve') {
      await tx
        .update(users)
        .set({ kycLevel: app.level, kycStatus: 'approved' })
        .where(eq(users.id, app.userId));
    } else {
      await tx.update(users).set({ kycStatus: 'rejected' }).where(eq(users.id, app.userId));
    }

    logger.info(
      { applicationId: opts.applicationId, action: opts.action, reviewerId: opts.reviewerId },
      '[kyc] reviewed'
    );
    return { success: true };
  });
}
