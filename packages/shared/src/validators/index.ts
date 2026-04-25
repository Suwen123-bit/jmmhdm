import { z } from 'zod';
import {
  SUPPORTED_SYMBOLS,
  TRADE_DIRECTIONS,
  TRADE_DURATIONS,
  TICKET_TYPES,
  TICKET_PRIORITY,
} from '../constants/index.js';

// ============== 认证 ==============
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少 3 位')
    .max(20, '用户名最多 20 位')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名仅允许字母数字下划线'),
  email: z.string().email('邮箱格式错误'),
  password: z.string().min(8, '密码至少 8 位').max(64),
  inviteCode: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  account: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
  totpCode: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(64),
});

export const setFundPasswordSchema = z.object({
  fundPassword: z.string().min(6).max(32),
  loginPassword: z.string().min(1),
});

// ============== 交易 ==============
export const tradeOpenSchema = z.object({
  symbol: z.enum(SUPPORTED_SYMBOLS),
  direction: z.enum(TRADE_DIRECTIONS),
  amount: z.number().positive().max(1_000_000),
  duration: z.union([z.literal(60), z.literal(300), z.literal(600)]),
});
export type TradeOpenInput = z.infer<typeof tradeOpenSchema>;

export const tradeListQuerySchema = z.object({
  status: z.enum(['open', 'settled', 'all']).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ============== 盲盒 ==============
export const blindboxOpenSchema = z.object({
  blindboxId: z.number().int().positive(),
  count: z.number().int().min(1).max(10).default(1),
});
export type BlindboxOpenInput = z.infer<typeof blindboxOpenSchema>;

export const blindboxExchangeSchema = z.object({
  inventoryIds: z.array(z.number().int().positive()).min(1).max(50),
});

// ============== 钱包 ==============
export const depositCreateSchema = z.object({
  amountUsd: z.number().positive().min(10).max(1_000_000),
  payCurrency: z.string().min(2).max(20),
});
export type DepositCreateInput = z.infer<typeof depositCreateSchema>;

export const withdrawCreateSchema = z.object({
  currency: z.string().min(2).max(20),
  network: z.string().min(2).max(20),
  toAddress: z.string().min(10).max(120),
  amount: z.number().positive(),
  fundPassword: z.string().min(6).max(32),
  totpCode: z.string().optional(),
});
export type WithdrawCreateInput = z.infer<typeof withdrawCreateSchema>;

// ============== 工单 ==============
export const ticketCreateSchema = z.object({
  type: z.enum(TICKET_TYPES),
  subject: z.string().min(2).max(200),
  content: z.string().min(2).max(5000),
  priority: z.enum(TICKET_PRIORITY).default('normal'),
  attachments: z.array(z.string().url()).max(5).optional(),
});

export const ticketReplySchema = z.object({
  ticketId: z.number().int().positive(),
  content: z.string().min(1).max(5000),
  attachments: z.array(z.string().url()).max(5).optional(),
});

// ============== 个人资料 ==============
export const updateProfileSchema = z.object({
  avatar: z.string().url().optional(),
  language: z.enum(['zh-CN', 'zh-TW', 'en', 'ja', 'ko']).optional(),
});

// ============== 管理后台 - 用户 ==============
export const adminUserListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['active', 'frozen', 'banned']).optional(),
  role: z.enum(['user', 'agent', 'admin']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminAdjustBalanceSchema = z.object({
  userId: z.number().int().positive(),
  amount: z.number(),
  reason: z.string().min(2).max(500),
});

export const adminUpdateUserSchema = z.object({
  status: z.enum(['active', 'frozen', 'banned']).optional(),
  role: z.enum(['user', 'agent', 'admin', 'super_admin']).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
});

// ============== 管理后台 - 盲盒 ==============
export const adminBlindboxUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(100),
  price: z.number().positive(),
  coverUrl: z.string().url().or(z.string().startsWith('/')),
  description: z.string().max(2000).default(''),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  isLimited: z.boolean().default(false),
  limitCount: z.number().int().positive().nullable().default(null),
  startAt: z.string().datetime().nullable().default(null),
  endAt: z.string().datetime().nullable().default(null),
  sortOrder: z.number().int().default(0),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        probability: z.number().min(0).max(1),
        stock: z.number().int().min(0),
      })
    )
    .min(1),
});

export const adminBlindboxProductUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(100),
  imageUrl: z.string().url().or(z.string().startsWith('/')),
  description: z.string().max(2000).default(''),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary', 'mythic']),
  value: z.number().nonnegative(),
});

// ============== 管理后台 - 提现审核 ==============
export const adminWithdrawReviewSchema = z.object({
  withdrawId: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

// ============== 管理后台 - 系统配置 ==============
export const adminConfigUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

// ============== 管理后台 - 风控 ==============
export const adminRiskConfigUpsertSchema = z.object({
  symbol: z.enum(SUPPORTED_SYMBOLS),
  duration: z.union([z.literal(60), z.literal(300), z.literal(600)]),
  payoutRate: z.number().min(0).max(2),
  priceOffsetBps: z.number().min(-10000).max(10000).default(0),
  trendBias: z.number().min(-1).max(1).default(0),
  delayMs: z.number().int().min(0).max(5000).default(0),
  maxSingleBet: z.number().positive(),
  maxTotalExposure: z.number().positive(),
  enabled: z.boolean().default(true),
});

// 单个盲盒奖品池项（用于管理后台批量编辑）
export const adminBlindboxItemSchema = z.object({
  productId: z.number().int().positive(),
  probability: z.number().min(0).max(1),
  stock: z.number().int().min(0),
  initialStock: z.number().int().min(0).optional(),
});

// ============== KYC ==============
export const kycSubmitSchema = z.object({
  level: z.union([z.literal(1), z.literal(2)]).default(1),
  realName: z.string().min(2).max(128),
  idType: z.enum(['id_card', 'passport', 'driver_license']),
  idNumber: z.string().min(4).max(64),
  idFrontUrl: z.string().url().or(z.string().startsWith('/')),
  idBackUrl: z.string().url().or(z.string().startsWith('/')).optional(),
  selfieUrl: z.string().url().or(z.string().startsWith('/')).optional(),
});
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;

export const adminKycReviewSchema = z.object({
  applicationId: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

// ============== 反欺诈 ==============
export const ipBlacklistUpsertSchema = z.object({
  ipOrCidr: z.string().min(3).max(64),
  reason: z.string().max(500).default(''),
});

export const geoBlockUpsertSchema = z.object({
  countryCode: z.string().length(2).toUpperCase(),
  countryName: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
});

// ============== 用户协议 ==============
export const agreementAcceptSchema = z.object({
  agreementType: z.enum(['terms', 'privacy', 'risk']),
  version: z.string().min(1).max(16),
});

// ============== 文件上传 ==============
export const uploadPresignSchema = z.object({
  scope: z.enum(['kyc', 'avatar', 'ticket', 'blindbox']),
  contentType: z.string().min(3).max(64),
  contentLength: z.number().int().positive().max(50 * 1024 * 1024).optional(),
  filename: z.string().min(1).max(256).optional(),
});
export type UploadPresignInput = z.infer<typeof uploadPresignSchema>;

// ============== 公告 ==============
export const announcementUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
  type: z.enum(['info', 'warning', 'success', 'critical']).default('info'),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  startAt: z.string().datetime().nullable().default(null),
  endAt: z.string().datetime().nullable().default(null),
});
