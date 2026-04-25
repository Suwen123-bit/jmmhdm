import {
  pgTable,
  serial,
  bigserial,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  decimal,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ============== 用户 ==============
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 32 }).notNull().unique(),
    email: varchar('email', { length: 128 }).notNull().unique(),
    phone: varchar('phone', { length: 32 }),
    passwordHash: varchar('password_hash', { length: 128 }).notNull(),
    fundPasswordHash: varchar('fund_password_hash', { length: 128 }),
    avatar: text('avatar'),
    balance: decimal('balance', { precision: 20, scale: 6 }).notNull().default('0'),
    frozenBalance: decimal('frozen_balance', { precision: 20, scale: 6 }).notNull().default('0'),
    inviteCode: varchar('invite_code', { length: 16 }).notNull().unique(),
    parentId: integer('parent_id'),
    role: varchar('role', { length: 16 }).notNull().default('user'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    language: varchar('language', { length: 8 }).notNull().default('zh-CN'),
    kycLevel: integer('kyc_level').notNull().default(0),
    kycStatus: varchar('kyc_status', { length: 16 }).notNull().default('none'),
    lastLoginAt: timestamp('last_login_at'),
    lastLoginIp: varchar('last_login_ip', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index('users_parent_idx').on(t.parentId),
    statusIdx: index('users_status_idx').on(t.status),
  })
);

export const userTotp = pgTable('user_totp', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique(),
  secretEncrypted: text('secret_encrypted').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull(),
    deviceInfo: text('device_info'),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    tokenIdx: index('sessions_token_idx').on(t.refreshTokenHash),
  })
);

export const loginLogs = pgTable(
  'login_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id'),
    account: varchar('account', { length: 128 }),
    ip: varchar('ip', { length: 64 }),
    device: text('device'),
    geoLocation: varchar('geo_location', { length: 128 }),
    success: boolean('success').notNull(),
    errorMessage: varchar('error_message', { length: 256 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('login_logs_user_idx').on(t.userId, t.createdAt),
  })
);

// ============== 交易 ==============
export const trades = pgTable(
  'trades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    symbol: varchar('symbol', { length: 16 }).notNull(),
    direction: varchar('direction', { length: 8 }).notNull(),
    amount: decimal('amount', { precision: 20, scale: 6 }).notNull(),
    duration: integer('duration').notNull(),
    entryPrice: decimal('entry_price', { precision: 20, scale: 8 }).notNull(),
    exitPrice: decimal('exit_price', { precision: 20, scale: 8 }),
    payoutRate: decimal('payout_rate', { precision: 6, scale: 4 }).notNull(),
    profit: decimal('profit', { precision: 20, scale: 6 }),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    result: varchar('result', { length: 8 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    settleAt: timestamp('settle_at').notNull(),
    settledAt: timestamp('settled_at'),
  },
  (t) => ({
    userIdx: index('trades_user_idx').on(t.userId, t.status),
    symbolIdx: index('trades_symbol_idx').on(t.symbol, t.createdAt),
    settleIdx: index('trades_settle_idx').on(t.settleAt, t.status),
  })
);

export const tradeRiskConfig = pgTable(
  'trade_risk_config',
  {
    id: serial('id').primaryKey(),
    symbol: varchar('symbol', { length: 16 }).notNull(),
    duration: integer('duration').notNull(),
    payoutRate: decimal('payout_rate', { precision: 6, scale: 4 }).notNull().default('0.85'),
    priceOffsetBps: integer('price_offset_bps').notNull().default(0),
    trendBias: decimal('trend_bias', { precision: 4, scale: 3 }).notNull().default('0'),
    delayMs: integer('delay_ms').notNull().default(0),
    maxSingleBet: decimal('max_single_bet', { precision: 20, scale: 6 })
      .notNull()
      .default('10000'),
    maxTotalExposure: decimal('max_total_exposure', { precision: 20, scale: 6 })
      .notNull()
      .default('1000000'),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    symbolDurationIdx: uniqueIndex('risk_config_symbol_duration_idx').on(t.symbol, t.duration),
  })
);

// ============== 盲盒 ==============
export const blindboxProducts = pgTable('blindbox_products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  imageUrl: text('image_url').notNull(),
  description: text('description').notNull().default(''),
  rarity: varchar('rarity', { length: 16 }).notNull(),
  value: decimal('value', { precision: 20, scale: 6 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const blindboxes = pgTable(
  'blindboxes',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    price: decimal('price', { precision: 20, scale: 6 }).notNull(),
    coverUrl: text('cover_url').notNull(),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    isLimited: boolean('is_limited').notNull().default(false),
    limitCount: integer('limit_count'),
    soldCount: integer('sold_count').notNull().default(0),
    startAt: timestamp('start_at'),
    endAt: timestamp('end_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('blindboxes_active_idx').on(t.isActive, t.sortOrder),
  })
);

export const blindboxItems = pgTable(
  'blindbox_items',
  {
    id: serial('id').primaryKey(),
    blindboxId: integer('blindbox_id').notNull(),
    productId: integer('product_id').notNull(),
    probability: decimal('probability', { precision: 8, scale: 6 }).notNull(),
    stock: integer('stock').notNull().default(0),
    initialStock: integer('initial_stock').notNull().default(0),
  },
  (t) => ({
    boxIdx: index('blindbox_items_box_idx').on(t.blindboxId),
  })
);

export const blindboxRecords = pgTable(
  'blindbox_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    blindboxId: integer('blindbox_id').notNull(),
    productId: integer('product_id').notNull(),
    rarity: varchar('rarity', { length: 16 }).notNull(),
    cost: decimal('cost', { precision: 20, scale: 6 }).notNull(),
    isPity: boolean('is_pity').notNull().default(false),
    action: varchar('action', { length: 16 }).notNull().default('kept'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('blindbox_records_user_idx').on(t.userId, t.createdAt),
    rarityIdx: index('blindbox_records_rarity_idx').on(t.rarity, t.createdAt),
  })
);

export const userInventory = pgTable(
  'user_inventory',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    productId: integer('product_id').notNull(),
    sourceRecordId: bigint('source_record_id', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('owned'),
    exchangedAt: timestamp('exchanged_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('inventory_user_idx').on(t.userId, t.status),
  })
);

export const userPityCounter = pgTable(
  'user_pity_counter',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    blindboxId: integer('blindbox_id').notNull(),
    counter: integer('counter').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userBoxIdx: uniqueIndex('pity_user_box_idx').on(t.userId, t.blindboxId),
  })
);

// ============== 资金 ==============
export const deposits = pgTable(
  'deposits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    nowpayInvoiceId: varchar('nowpay_invoice_id', { length: 64 }),
    nowpayPaymentId: varchar('nowpay_payment_id', { length: 64 }),
    orderId: varchar('order_id', { length: 64 }).notNull().unique(),
    payCurrency: varchar('pay_currency', { length: 24 }).notNull(),
    payAmount: decimal('pay_amount', { precision: 30, scale: 10 }),
    priceAmount: decimal('price_amount', { precision: 20, scale: 6 }).notNull(),
    actuallyPaid: decimal('actually_paid', { precision: 30, scale: 10 }),
    outcomeAmount: decimal('outcome_amount', { precision: 20, scale: 6 }),
    payAddress: text('pay_address'),
    status: varchar('status', { length: 16 }).notNull().default('waiting'),
    ipnRaw: jsonb('ipn_raw'),
    expireAt: timestamp('expire_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at'),
  },
  (t) => ({
    userIdx: index('deposits_user_idx').on(t.userId, t.status),
    invoiceIdx: index('deposits_invoice_idx').on(t.nowpayInvoiceId),
  })
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    currency: varchar('currency', { length: 24 }).notNull(),
    network: varchar('network', { length: 24 }).notNull(),
    toAddress: text('to_address').notNull(),
    amount: decimal('amount', { precision: 20, scale: 6 }).notNull(),
    fee: decimal('fee', { precision: 20, scale: 6 }).notNull().default('0'),
    nowpayPayoutId: varchar('nowpay_payout_id', { length: 64 }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    riskScore: integer('risk_score').notNull().default(0),
    reviewedBy: integer('reviewed_by'),
    reviewNote: text('review_note'),
    txHash: varchar('tx_hash', { length: 128 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (t) => ({
    userIdx: index('withdrawals_user_idx').on(t.userId, t.status),
    statusIdx: index('withdrawals_status_idx').on(t.status, t.createdAt),
  })
);

export const walletLogs = pgTable(
  'wallet_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    amount: decimal('amount', { precision: 20, scale: 6 }).notNull(),
    balanceBefore: decimal('balance_before', { precision: 20, scale: 6 }).notNull(),
    balanceAfter: decimal('balance_after', { precision: 20, scale: 6 }).notNull(),
    refType: varchar('ref_type', { length: 32 }),
    refId: varchar('ref_id', { length: 64 }),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('wallet_logs_user_idx').on(t.userId, t.createdAt),
    typeIdx: index('wallet_logs_type_idx').on(t.type, t.createdAt),
  })
);

// ============== 代理 ==============
export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique(),
  parentId: integer('parent_id'),
  level: integer('level').notNull().default(1),
  l1Rate: decimal('l1_rate', { precision: 6, scale: 4 }).notNull().default('0.30'),
  l2Rate: decimal('l2_rate', { precision: 6, scale: 4 }).notNull().default('0.20'),
  l3Rate: decimal('l3_rate', { precision: 6, scale: 4 }).notNull().default('0.10'),
  totalCommission: decimal('total_commission', { precision: 20, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const commissions = pgTable(
  'commissions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    agentUserId: integer('agent_user_id').notNull(),
    fromUserId: integer('from_user_id').notNull(),
    sourceType: varchar('source_type', { length: 16 }).notNull().default('trade'),
    sourceId: bigint('source_id', { mode: 'number' }).notNull(),
    level: integer('level').notNull(),
    sourceAmount: decimal('source_amount', { precision: 20, scale: 6 }).notNull(),
    commissionRate: decimal('commission_rate', { precision: 6, scale: 4 }).notNull(),
    commissionAmount: decimal('commission_amount', { precision: 20, scale: 6 }).notNull(),
    settled: boolean('settled').notNull().default(false),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('commissions_agent_idx').on(t.agentUserId, t.settled),
    fromIdx: index('commissions_from_idx').on(t.fromUserId),
    // 防止同一笔 source（trade/blindbox）对同一代理同一层级重复发放
    uniqSource: uniqueIndex('commissions_source_uniq_idx').on(
      t.sourceType,
      t.sourceId,
      t.level,
      t.agentUserId
    ),
  })
);

// ============== 工单 ==============
export const tickets = pgTable(
  'tickets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    priority: varchar('priority', { length: 8 }).notNull().default('normal'),
    assignedTo: integer('assigned_to'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (t) => ({
    userIdx: index('tickets_user_idx').on(t.userId, t.status),
    statusIdx: index('tickets_status_idx').on(t.status, t.priority, t.createdAt),
  })
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: integer('ticket_id').notNull(),
    senderType: varchar('sender_type', { length: 8 }).notNull(),
    senderId: integer('sender_id').notNull(),
    content: text('content').notNull(),
    attachments: jsonb('attachments').notNull().default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt),
  })
);

// ============== 通知 ==============
export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    channel: varchar('channel', { length: 16 }).notNull().default('in_app'),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    refType: varchar('ref_type', { length: 32 }),
    refId: varchar('ref_id', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId, t.isRead, t.createdAt),
  })
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: integer('user_id').notNull(),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
    webpush: boolean('webpush').notNull().default(true),
    telegram: boolean('telegram').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.eventType] }),
  })
);

export const userTelegram = pgTable('user_telegram', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique(),
  telegramChatId: varchar('telegram_chat_id', { length: 64 }).notNull(),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// WebPush 订阅
export const webPushSubscriptions = pgTable(
  'web_push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('webpush_user_idx').on(t.userId),
  })
);

// Passkey / WebAuthn
export const passkeys = pgTable(
  'passkeys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: jsonb('transports').notNull().default([]),
    deviceName: varchar('device_name', { length: 128 }),
    backedUp: boolean('backed_up').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
  },
  (t) => ({
    userIdx: index('passkey_user_idx').on(t.userId),
  })
);

// Passkey 注册/登录挑战临时存储（短 TTL 也可放 Redis；此处保留表便于审计）
export const passkeyChallenges = pgTable(
  'passkey_challenges',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id'),
    sessionToken: varchar('session_token', { length: 64 }).notNull().unique(),
    challenge: text('challenge').notNull(),
    type: varchar('type', { length: 16 }).notNull(), // 'register' | 'login'
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  }
);

// ============== 反欺诈 & 合规 ==============
export const deviceFingerprints = pgTable(
  'device_fingerprints',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    fingerprintHash: varchar('fingerprint_hash', { length: 128 }).notNull(),
    deviceInfo: jsonb('device_info'),
    riskLevel: varchar('risk_level', { length: 16 }).notNull().default('normal'),
    firstSeen: timestamp('first_seen').notNull().defaultNow(),
    lastSeen: timestamp('last_seen').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('fp_user_idx').on(t.userId),
    fpIdx: index('fp_hash_idx').on(t.fingerprintHash),
  })
);

export const ipBlacklist = pgTable('ip_blacklist', {
  id: serial('id').primaryKey(),
  ipOrCidr: varchar('ip_or_cidr', { length: 64 }).notNull().unique(),
  reason: text('reason').notNull().default(''),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const geoBlocks = pgTable('geo_blocks', {
  id: serial('id').primaryKey(),
  countryCode: varchar('country_code', { length: 4 }).notNull().unique(),
  countryName: varchar('country_name', { length: 64 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const kycApplications = pgTable(
  'kyc_applications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    level: integer('level').notNull().default(1),
    realName: varchar('real_name', { length: 128 }),
    idType: varchar('id_type', { length: 32 }),
    idNumber: varchar('id_number', { length: 128 }),
    idFrontUrl: text('id_front_url'),
    idBackUrl: text('id_back_url'),
    selfieUrl: text('selfie_url'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    reviewedBy: integer('reviewed_by'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (t) => ({
    userIdx: index('kyc_user_idx').on(t.userId, t.status),
  })
);

export const userAgreements = pgTable('user_agreements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').notNull(),
  agreementType: varchar('agreement_type', { length: 32 }).notNull(),
  version: varchar('version', { length: 16 }).notNull(),
  ip: varchar('ip', { length: 64 }),
  agreedAt: timestamp('agreed_at').notNull().defaultNow(),
});

// ============== AI 风控 / 异常事件 ==============
export const aiAnomalies = pgTable(
  'ai_anomalies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    category: varchar('category', { length: 32 }).notNull(),   // hedge / high_freq / large_bet / suspicious_withdraw / login_anomaly / kyc_mismatch
    severity: varchar('severity', { length: 16 }).notNull().default('info'), // info / warning / critical
    score: integer('score').notNull().default(0),               // 0~100 风险分
    reason: text('reason').notNull(),
    detail: jsonb('detail'),                                    // 上下文（trade ids、金额、时间等）
    resolved: boolean('resolved').notNull().default(false),
    resolvedBy: integer('resolved_by'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('ai_anomalies_user_idx').on(t.userId, t.createdAt),
    categoryIdx: index('ai_anomalies_category_idx').on(t.category, t.severity, t.createdAt),
    unresolvedIdx: index('ai_anomalies_unresolved_idx').on(t.resolved, t.createdAt),
  })
);

// ============== 系统 ==============
export const announcements = pgTable(
  'announcements',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    type: varchar('type', { length: 16 }).notNull().default('info'),
    priority: integer('priority').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    startAt: timestamp('start_at'),
    endAt: timestamp('end_at'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('announcements_active_idx').on(t.isActive, t.priority),
  })
);

export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value'),
  description: text('description').notNull().default(''),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const adminLogs = pgTable(
  'admin_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminId: integer('admin_id').notNull(),
    module: varchar('module', { length: 32 }).notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: varchar('target_id', { length: 64 }),
    detailJson: jsonb('detail_json'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    adminIdx: index('admin_logs_admin_idx').on(t.adminId, t.createdAt),
    moduleIdx: index('admin_logs_module_idx').on(t.module, t.createdAt),
  })
);

// ============== 类型导出 ==============
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type Blindbox = typeof blindboxes.$inferSelect;
export type BlindboxItem = typeof blindboxItems.$inferSelect;
export type BlindboxProduct = typeof blindboxProducts.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type WalletLog = typeof walletLogs.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
