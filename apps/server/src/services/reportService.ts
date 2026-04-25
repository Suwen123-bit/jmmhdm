import { and, gte, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  deposits,
  withdrawals,
  trades,
  commissions,
  users,
  adminLogs,
} from '../db/schema.js';
import { logger } from '../logger.js';

export type ReportType =
  | 'deposits'
  | 'withdrawals'
  | 'trades'
  | 'commissions'
  | 'users'
  | 'audit_logs';

interface ExportOpts {
  type: ReportType;
  startDate: Date;
  endDate: Date;
}

/**
 * 导出 CSV — 流式实现的简化版（一次性 stringify 所有行）
 * 大表请加 limit + 分批写入文件再下载
 */
export async function exportCsv(opts: ExportOpts): Promise<string> {
  const { type, startDate, endDate } = opts;
  switch (type) {
    case 'deposits':
      return exportDeposits(startDate, endDate);
    case 'withdrawals':
      return exportWithdrawals(startDate, endDate);
    case 'trades':
      return exportTrades(startDate, endDate);
    case 'commissions':
      return exportCommissions(startDate, endDate);
    case 'users':
      return exportUsers(startDate, endDate);
    case 'audit_logs':
      return exportAuditLogs(startDate, endDate);
  }
}

function csvLine(cols: (string | number | null | undefined)[]): string {
  return cols
    .map((c) => {
      if (c === null || c === undefined) return '';
      const s = String(c);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(',');
}

function csvFromRows(headers: string[], rows: any[][]): string {
  const lines = [csvLine(headers), ...rows.map(csvLine)];
  // BOM 让 Excel 识别 UTF-8
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

async function exportDeposits(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select({
      id: deposits.id,
      userId: deposits.userId,
      orderId: deposits.orderId,
      payCurrency: deposits.payCurrency,
      payAmount: deposits.payAmount,
      priceAmount: deposits.priceAmount,
      actuallyPaid: deposits.actuallyPaid,
      status: deposits.status,
      createdAt: deposits.createdAt,
      confirmedAt: deposits.confirmedAt,
    })
    .from(deposits)
    .where(and(gte(deposits.createdAt, start), lte(deposits.createdAt, end)));
  logger.info({ rows: rows.length, type: 'deposits' }, '[report] exported');
  return csvFromRows(
    ['id', 'user_id', 'order_id', 'pay_currency', 'pay_amount', 'price_amount_usd', 'actually_paid', 'status', 'created_at', 'confirmed_at'],
    rows.map((r) => [
      r.id, r.userId, r.orderId, r.payCurrency,
      r.payAmount ?? '', r.priceAmount, r.actuallyPaid ?? '',
      r.status, r.createdAt.toISOString(), r.confirmedAt?.toISOString() ?? '',
    ])
  );
}

async function exportWithdrawals(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select()
    .from(withdrawals)
    .where(and(gte(withdrawals.createdAt, start), lte(withdrawals.createdAt, end)));
  return csvFromRows(
    ['id', 'user_id', 'currency', 'network', 'to_address', 'amount', 'fee', 'status', 'review_note', 'tx_hash', 'created_at', 'reviewed_at'],
    rows.map((r) => [
      r.id, r.userId, r.currency, r.network, r.toAddress, r.amount, r.fee,
      r.status, r.reviewNote ?? '', r.txHash ?? '',
      r.createdAt.toISOString(), r.reviewedAt?.toISOString() ?? '',
    ])
  );
}

async function exportTrades(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select()
    .from(trades)
    .where(and(gte(trades.createdAt, start), lte(trades.createdAt, end)));
  return csvFromRows(
    ['id', 'user_id', 'symbol', 'direction', 'amount', 'duration', 'entry_price', 'exit_price', 'payout_rate', 'profit', 'status', 'result', 'created_at', 'settled_at'],
    rows.map((r) => [
      r.id, r.userId, r.symbol, r.direction, r.amount, r.duration,
      r.entryPrice, r.exitPrice ?? '', r.payoutRate, r.profit ?? '',
      r.status, r.result ?? '',
      r.createdAt.toISOString(), r.settledAt?.toISOString() ?? '',
    ])
  );
}

async function exportCommissions(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select()
    .from(commissions)
    .where(and(gte(commissions.createdAt, start), lte(commissions.createdAt, end)));
  return csvFromRows(
    ['id', 'agent_user_id', 'from_user_id', 'source_type', 'source_id', 'level', 'source_amount', 'commission_rate', 'commission_amount', 'settled', 'created_at'],
    rows.map((r) => [
      r.id, r.agentUserId, r.fromUserId, r.sourceType, r.sourceId, r.level,
      r.sourceAmount, r.commissionRate, r.commissionAmount,
      r.settled ? '1' : '0',
      r.createdAt.toISOString(),
    ])
  );
}

async function exportUsers(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
      kycLevel: users.kycLevel,
      kycStatus: users.kycStatus,
      balance: users.balance,
      frozenBalance: users.frozenBalance,
      parentId: users.parentId,
      inviteCode: users.inviteCode,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(gte(users.createdAt, start), lte(users.createdAt, end)));
  return csvFromRows(
    ['id', 'username', 'email', 'role', 'status', 'kyc_level', 'kyc_status', 'balance', 'frozen_balance', 'parent_id', 'invite_code', 'last_login_at', 'created_at'],
    rows.map((r) => [
      r.id, r.username, r.email, r.role, r.status, r.kycLevel, r.kycStatus,
      r.balance, r.frozenBalance, r.parentId ?? '', r.inviteCode,
      r.lastLoginAt?.toISOString() ?? '', r.createdAt.toISOString(),
    ])
  );
}

async function exportAuditLogs(start: Date, end: Date): Promise<string> {
  const rows = await db
    .select()
    .from(adminLogs)
    .where(and(gte(adminLogs.createdAt, start), lte(adminLogs.createdAt, end)));
  return csvFromRows(
    ['id', 'admin_id', 'module', 'action', 'target_type', 'target_id', 'ip', 'created_at'],
    rows.map((r) => [
      r.id, r.adminId, r.module, r.action, r.targetType ?? '',
      r.targetId ?? '', r.ip ?? '', r.createdAt.toISOString(),
    ])
  );
}
