import type {
  TradeDirection,
  TradeStatus,
  TradeResult,
  Rarity,
  UserRole,
  UserStatus,
  WalletLogType,
  DepositStatus,
  WithdrawStatus,
  NotificationChannel,
  NotificationEvent,
  TicketType,
  TicketStatus,
  TicketPriority,
  KycLevel,
  KycStatus,
} from '../constants/index.js';

// ============== 用户 ==============
export interface User {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  balance: string; // decimal string
  frozenBalance: string;
  inviteCode: string;
  parentId: number | null;
  role: UserRole;
  status: UserStatus;
  language: string;
  totpEnabled: boolean;
  hasFundPassword: boolean;
  kycLevel: KycLevel;
  kycStatus: KycStatus;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============== 行情 ==============
export interface PriceTick {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  ts: number;
}

export interface Kline {
  symbol: string;
  interval: '1min' | '5min' | '15min' | '30min' | '60min' | '1day';
  time: number; // 秒
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============== 交易 ==============
export interface Trade {
  id: number;
  userId: number;
  symbol: string;
  direction: TradeDirection;
  amount: string;
  duration: number;
  entryPrice: string;
  exitPrice: string | null;
  payoutRate: string;
  profit: string | null;
  status: TradeStatus;
  result: TradeResult | null;
  createdAt: string;
  settleAt: string;
  settledAt: string | null;
}

export interface TradeOpenRequest {
  symbol: string;
  direction: TradeDirection;
  amount: number;
  duration: number;
}

// ============== 盲盒 ==============
export interface Blindbox {
  id: number;
  name: string;
  price: string;
  coverUrl: string;
  description: string;
  tags: string[];
  isActive: boolean;
  isLimited: boolean;
  limitCount: number | null;
  soldCount: number;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  items?: BlindboxItem[];
}

export interface BlindboxProduct {
  id: number;
  name: string;
  imageUrl: string;
  description: string;
  rarity: Rarity;
  value: string;
}

export interface BlindboxItem {
  id: number;
  blindboxId: number;
  productId: number;
  product: BlindboxProduct;
  probability: string;
  stock: number;
  initialStock: number;
}

export interface BlindboxOpenResult {
  recordId: number;
  product: BlindboxProduct;
  isPity: boolean;
}

// ============== 钱包 ==============
export interface Deposit {
  id: number;
  userId: number;
  payCurrency: string;
  payAmount: string;
  priceAmount: string;
  actuallyPaid: string | null;
  status: DepositStatus;
  payAddress: string | null;
  expireAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Withdrawal {
  id: number;
  userId: number;
  currency: string;
  network: string;
  toAddress: string;
  amount: string;
  fee: string;
  status: WithdrawStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface WalletLog {
  id: number;
  userId: number;
  type: WalletLogType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

// ============== 代理 ==============
export interface AgentInfo {
  inviteCode: string;
  inviteLink: string;
  totalCommission: string;
  todayCommission: string;
  weekCommission: string;
  monthCommission: string;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  l1Rate: string;
  l2Rate: string;
  l3Rate: string;
}

// ============== 通知 ==============
export interface Notification {
  id: number;
  userId: number;
  type: NotificationEvent;
  channel: NotificationChannel;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

// ============== 工单 ==============
export interface Ticket {
  id: number;
  userId: number;
  type: TicketType;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages?: TicketMessage[];
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderType: 'user' | 'admin';
  senderId: number;
  senderName?: string;
  content: string;
  attachments: string[];
  createdAt: string;
}

// ============== Feature toggle ==============
export type FeatureFlags = Record<string, boolean>;

// ============== API 响应 ==============
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============== 公告 ==============
export interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'critical';
  priority: number;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
}
