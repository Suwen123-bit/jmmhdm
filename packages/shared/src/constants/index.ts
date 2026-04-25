// ============== 交易对 ==============
export const SUPPORTED_SYMBOLS = [
  'btcusdt',
  'ethusdt',
  'solusdt',
  'dogeusdt',
  'xrpusdt',
  'adausdt',
  'bnbusdt',
  'ltcusdt',
] as const;

export type Symbol = (typeof SUPPORTED_SYMBOLS)[number];

export const SYMBOL_DISPLAY: Record<string, { name: string; icon: string; precision: number }> = {
  btcusdt: { name: 'BTC/USDT', icon: '₿', precision: 2 },
  ethusdt: { name: 'ETH/USDT', icon: 'Ξ', precision: 2 },
  solusdt: { name: 'SOL/USDT', icon: '◎', precision: 3 },
  dogeusdt: { name: 'DOGE/USDT', icon: 'Ð', precision: 5 },
  xrpusdt: { name: 'XRP/USDT', icon: '✕', precision: 4 },
  adausdt: { name: 'ADA/USDT', icon: '₳', precision: 4 },
  bnbusdt: { name: 'BNB/USDT', icon: 'B', precision: 2 },
  ltcusdt: { name: 'LTC/USDT', icon: 'Ł', precision: 2 },
};

// ============== 交易周期 ==============
export const TRADE_DURATIONS = [60, 300, 600] as const; // 秒
export type TradeDuration = (typeof TRADE_DURATIONS)[number];

export const TRADE_DURATION_LABEL: Record<number, string> = {
  60: '1 分钟',
  300: '5 分钟',
  600: '10 分钟',
};

// ============== 方向 ==============
export const TRADE_DIRECTIONS = ['call', 'put'] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

// ============== 订单状态 ==============
export const TRADE_STATUS = ['open', 'settled', 'cancelled'] as const;
export type TradeStatus = (typeof TRADE_STATUS)[number];

export const TRADE_RESULT = ['win', 'lose', 'draw'] as const;
export type TradeResult = (typeof TRADE_RESULT)[number];

// ============== 盲盒稀有度 ==============
export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_DISPLAY: Record<Rarity, { name: string; color: string; weight: number }> = {
  common: { name: '普通', color: '#9ca3af', weight: 1 },
  rare: { name: '稀有', color: '#3b82f6', weight: 2 },
  epic: { name: '史诗', color: '#8b5cf6', weight: 3 },
  legendary: { name: '传说', color: '#f59e0b', weight: 4 },
  mythic: { name: '神话', color: '#ef4444', weight: 5 },
};

// ============== 用户角色 ==============
export const USER_ROLES = ['user', 'agent', 'admin', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ============== 用户状态 ==============
export const USER_STATUS = ['active', 'frozen', 'banned'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

// ============== 钱包流水类型 ==============
export const WALLET_LOG_TYPES = [
  'deposit',
  'withdraw',
  'trade_open',
  'trade_settle_win',
  'trade_settle_lose',
  'trade_refund',
  'blindbox_buy',
  'blindbox_exchange',
  'commission',
  'admin_adjust',
  'fee',
] as const;
export type WalletLogType = (typeof WALLET_LOG_TYPES)[number];

// ============== 充值/提现状态 ==============
export const DEPOSIT_STATUS = [
  'waiting',
  'confirming',
  'confirmed',
  'finished',
  'expired',
  'failed',
] as const;
export type DepositStatus = (typeof DEPOSIT_STATUS)[number];

export const WITHDRAW_STATUS = [
  'pending',
  'reviewing',
  'approved',
  'processing',
  'finished',
  'rejected',
  'failed',
] as const;
export type WithdrawStatus = (typeof WITHDRAW_STATUS)[number];

// ============== 功能开关 ==============
export const FEATURE_KEYS = [
  'trade',
  'blindbox',
  'agent',
  'ai_assistant',
  'kyc',
  'passkey',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// ============== 系统配置 key ==============
export const CONFIG_KEYS = {
  // Feature toggles
  FEATURE_TRADE_ENABLED: 'feature.trade.enabled',
  FEATURE_BLINDBOX_ENABLED: 'feature.blindbox.enabled',
  FEATURE_AGENT_ENABLED: 'feature.agent.enabled',
  FEATURE_AI_ASSISTANT_ENABLED: 'feature.ai_assistant.enabled',
  FEATURE_KYC_ENABLED: 'feature.kyc.enabled',
  FEATURE_PASSKEY_ENABLED: 'feature.passkey.enabled',
  // Trade
  TRADE_MIN_AMOUNT: 'trade.min_amount',
  TRADE_MAX_AMOUNT: 'trade.max_amount',
  TRADE_DEFAULT_PAYOUT_RATE: 'trade.default_payout_rate',
  // Withdraw
  WITHDRAW_MIN_AMOUNT: 'withdraw.min_amount',
  WITHDRAW_DAILY_LIMIT: 'withdraw.daily_limit',
  WITHDRAW_AUTO_APPROVE_THRESHOLD: 'withdraw.auto_approve_threshold',
  // Site
  SITE_NAME: 'site.name',
  SITE_LOGO: 'site.logo',
  SITE_MAINTENANCE_MODE: 'site.maintenance_mode',
  // Agent
  AGENT_L1_RATE: 'agent.l1_rate',
  AGENT_L2_RATE: 'agent.l2_rate',
  AGENT_L3_RATE: 'agent.l3_rate',
  // Notifications
  NOTIFY_EMAIL_ENABLED: 'notify.email.enabled',
  NOTIFY_TELEGRAM_ENABLED: 'notify.telegram.enabled',
} as const;

// ============== 通知 ==============
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'webpush', 'telegram'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  'register_welcome',
  'login_new_device',
  'deposit_received',
  'withdraw_approved',
  'withdraw_rejected',
  'trade_settled',
  'blindbox_legendary',
  'ticket_replied',
  'security_alert',
  'commission_received',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

// ============== 工单 ==============
export const TICKET_TYPES = [
  'deposit_issue',
  'withdraw_issue',
  'account_issue',
  'feature_request',
  'other',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];

export const TICKET_PRIORITY = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITY)[number];

// ============== KYC ==============
export const KYC_LEVELS = [0, 1, 2] as const;
export type KycLevel = (typeof KYC_LEVELS)[number];

export const KYC_STATUS = ['none', 'pending', 'approved', 'rejected', 'resubmit'] as const;
export type KycStatus = (typeof KYC_STATUS)[number];

// ============== WebSocket 事件 ==============
export const WS_EVENTS = {
  // 行情
  PRICE_TICK: 'price.tick',
  PRICE_KLINE: 'price.kline',
  // 用户
  TRADE_OPENED: 'trade.opened',
  TRADE_SETTLED: 'trade.settled',
  WALLET_UPDATED: 'wallet.updated',
  NOTIFICATION: 'notification',
  // 全站
  BROADCAST_BLINDBOX: 'broadcast.blindbox',
  BROADCAST_ANNOUNCEMENT: 'broadcast.announcement',
  // 系统
  FEATURES_UPDATED: 'features.updated',
} as const;

// ============== 充值币种支持 ==============
export const SUPPORTED_DEPOSIT_CURRENCIES = [
  { code: 'usdttrc20', name: 'USDT (TRC20)', decimals: 6 },
  { code: 'usdterc20', name: 'USDT (ERC20)', decimals: 6 },
  { code: 'btc', name: 'Bitcoin', decimals: 8 },
  { code: 'eth', name: 'Ethereum', decimals: 6 },
  { code: 'usdc', name: 'USDC', decimals: 6 },
  { code: 'sol', name: 'Solana', decimals: 4 },
] as const;

// ============== 默认配置值 ==============
export const DEFAULT_CONFIG = {
  TRADE_MIN_AMOUNT: 10,
  TRADE_MAX_AMOUNT: 10000,
  TRADE_DEFAULT_PAYOUT_RATE: 0.85,
  WITHDRAW_MIN_AMOUNT: 50,
  WITHDRAW_DAILY_LIMIT: 50000,
  WITHDRAW_AUTO_APPROVE_THRESHOLD: 500,
  AGENT_L1_RATE: 0.3,
  AGENT_L2_RATE: 0.2,
  AGENT_L3_RATE: 0.1,
  PLATFORM_FEE_RATE: 0.02,
  PITY_THRESHOLD: 30,
};
