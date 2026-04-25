# 加密货币合约期权交易 & 商品盲盒平台 — 2026 商业化运营方案

基于 HTX 真实行情 + 风控微调的加密货币短期合约交易平台 + 商品盲盒商城，集成 NOWPayments 加密货币收付款，采用 2026 年主流技术栈（React 19 / Hono / Drizzle ORM / Turborepo），包含 AI 辅助交易、Passkey 无密码认证、PWA 离线支持、完整运营后台与代理分销体系。

---

## 一、2026 技术栈选型

| 层级 | 技术方案 | 2026 优势 |
|------|---------|-----------|
| **Monorepo** | Turborepo + pnpm workspace | 前端/后台/后端统一管理，增量构建，依赖共享 |
| **前端（用户端）** | React 19 + Vite 6 + TailwindCSS v4 + shadcn/ui + Framer Motion | React 19 Server Components / Actions，Tailwind v4 原生CSS引擎，流畅动效 |
| **前端（管理后台）** | React 19 + Ant Design 6.x | AntD 6 全面拥抱 React 19，图表/表格/表单成熟 |
| **K线图表** | Lightweight Charts v5 (TradingView) | 专业金融图表、WebGL渲染、免费开源 |
| **后端 API** | Hono v4 + Node.js 22 LTS | Hono 超轻量(12KB)、边缘/Node通用、中间件生态丰富、性能领先 Express 10x |
| **数据库** | PostgreSQL 17 + Drizzle ORM | Drizzle: 零抽象、SQL-like类型安全、比 Prisma 快 3-5x、无代码生成 |
| **缓存 & 队列** | Redis 8 (Valkey) + BullMQ | 行情缓存、限流、会话、异步任务队列 |
| **实时通信** | WebSocket (Hono WebSocket Helper) + SSE 降级 | Hono 内置 WS 支持，SSE 作为移动端弱网降级方案 |
| **行情数据源** | HTX WebSocket API + 风控微调层 | 真实行情 + 后台可调参数 |
| **加密货币收付** | NOWPayments API v1 | 150+ 币种托管收付，IPN Webhook，免自建链上设施 |
| **认证** | Passkey (WebAuthn) + JWT + TOTP 2FA | 2026 主流无密码登录 + 传统密码兼容 + 二步验证 |
| **AI 能力** | OpenAI / 本地 LLM API | AI 行情分析助手、智能客服、异常交易检测 |
| **国际化** | i18next + ICU MessageFormat | 中/英/繁/日/韩 多语言 |
| **PWA** | Vite PWA Plugin + Service Worker | 离线缓存、推送通知、添加到主屏幕、类原生体验 |
| **监控** | OpenTelemetry + Grafana + Sentry + Loki | 全链路追踪、性能监控、错误追踪、日志聚合 |
| **对象存储 & CDN** | Cloudflare R2 / MinIO + CDN | 盲盒图片、头像等静态资源分发，S3兼容 |
| **反欺诈** | FingerprintJS Pro + IP风控库 | 设备指纹、多号检测、IP风险评分 |
| **多渠道通知** | Nodemailer + Telegram Bot API + WebPush | 邮件 + TG 机器人 + 浏览器推送 |
| **客服系统** | 内建工单 + Crisp/Tawk.to 可选集成 | 用户反馈渠道，运营必备 |
| **测试** | Vitest + Playwright + Supertest | 单元测试 + E2E测试 + API测试 |
| **部署** | Docker Compose + Nginx + PM2 | 容器编排一键部署，支持多实例水平扩展 |
| **高可用** | PG主从 + Redis Sentinel + Nginx LB | 数据库容灾、缓存容灾、后端多实例负载均衡 |
| **CI/CD** | GitHub Actions / GitLab CI | 自动测试、构建、部署 |

---

## 二、项目目录结构（Turborepo Monorepo）

```
e:\ppp\
├── turbo.json                        # Turborepo 配置
├── pnpm-workspace.yaml               # pnpm workspace
├── package.json                      # Root package (scripts, devDeps)
├── .env.example                      # 环境变量模板
├── docker-compose.yml                # PG + Redis + App 一键启动
├── docker-compose.prod.yml           # 生产环境编排
├── nginx/
│   └── nginx.conf                    # 反向代理 + SSL + gzip
│
├── packages/
│   ├── shared/                       # 前后端共享包
│   │   ├── types/                    # TypeScript 类型定义 (交易、盲盒、用户等)
│   │   ├── constants/                # 共享常量 (交易对列表、稀有度等级等)
│   │   ├── validators/               # Zod schema 验证 (前后端复用)
│   │   └── utils/                    # 通用工具函数
│   └── ui/                           # 共享UI组件库 (用户端 & 管理端复用)
│       └── src/
│
├── apps/
│   ├── web/                          # 用户端前端 (React 19 + Vite 6)
│   │   ├── public/
│   │   │   ├── manifest.json         # PWA manifest
│   │   │   └── sw.js                 # Service Worker
│   │   ├── src/
│   │   │   ├── app/                  # 应用入口 & 路由 (React Router v7)
│   │   │   ├── features/             # 按功能模块组织
│   │   │   │   ├── auth/             # 登录/注册/Passkey/2FA
│   │   │   │   ├── trade/            # 交易大厅 (K线 + 下单 + 持仓)
│   │   │   │   ├── blindbox/         # 盲盒商城 (展示 + 开箱 + 背包)
│   │   │   │   ├── wallet/           # 钱包 (充值/提现/流水)
│   │   │   │   ├── profile/          # 个人中心
│   │   │   │   ├── agent/            # 代理推广中心
│   │   │   │   ├── support/          # 客服 & 工单
│   │   │   │   └── ai-assistant/     # AI 行情分析助手
│   │   │   ├── components/           # 通用UI组件
│   │   │   ├── hooks/                # 自定义 Hooks
│   │   │   ├── stores/               # Zustand v5 状态管理
│   │   │   ├── lib/                  # API客户端、WS连接、工具
│   │   │   ├── i18n/                 # 多语言资源
│   │   │   └── styles/               # 全局样式 & Tailwind v4
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── admin/                        # 管理后台 (React 19 + Ant Design 6)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── pages/
│   │   │   │   ├── dashboard/        # 实时数据看板 (ECharts 6)
│   │   │   │   ├── users/            # 用户管理 & 详情
│   │   │   │   ├── trades/           # 交易管理 & 风控告警
│   │   │   │   ├── blindbox/         # 盲盒 & 奖品管理
│   │   │   │   ├── finance/          # 充提审核 & 资金流水
│   │   │   │   ├── agents/           # 代理管理 & 佣金
│   │   │   │   ├── risk-control/     # 行情风控参数面板
│   │   │   │   ├── ai-monitor/       # AI 异常交易监控
│   │   │   │   ├── antifraud/        # 反欺诈 & 设备指纹管理
│   │   │   │   ├── tickets/          # 工单客服管理
│   │   │   │   ├── compliance/       # 合规管理 (KYC/地域封禁)
│   │   │   │   ├── notifications/    # 公告 & 多渠道推送管理
│   │   │   │   ├── reports/          # 数据报表 & 导出
│   │   │   │   └── settings/         # 系统设置
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── server/                       # 后端服务 (Hono v4 + Node.js 22)
│       ├── src/
│       │   ├── index.ts              # 入口 (HTTP + WebSocket)
│       │   ├── config/               # 环境变量 & 配置 (type-safe env with zod)
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle 表定义
│       │   │   ├── migrations/       # SQL 迁移文件
│       │   │   └── seed.ts           # 种子数据
│       │   ├── middleware/           # Hono 中间件
│       │   │   ├── auth.ts           # JWT + Passkey 验证
│       │   │   ├── rbac.ts           # 角色权限控制 (admin/agent/user)
│       │   │   ├── rateLimiter.ts    # 接口限流 (Redis sliding window)
│       │   │   ├── logger.ts         # 请求日志 (OpenTelemetry)
│       │   │   ├── validator.ts      # Zod 请求体验证
│       │   │   ├── antifraud.ts      # 反欺诈 (设备指纹+IP风控+行为检测)
│       │   │   └── geo.ts            # IP地域检测 + 地域封禁
│       │   ├── routes/
│       │   │   ├── auth.ts           # 注册/登录/Passkey/2FA
│       │   │   ├── trade.ts          # 交易下单/持仓/记录
│       │   │   ├── blindbox.ts       # 盲盒购买/开箱/背包
│       │   │   ├── wallet.ts         # 充值/提现/流水
│       │   │   ├── user.ts           # 个人信息/设置
│       │   │   ├── agent.ts          # 代理推广/佣金
│       │   │   ├── ai.ts             # AI 助手接口
│       │   │   ├── nowpay-webhook.ts # NOWPayments IPN 回调
│       │   │   └── admin/            # 管理后台 API
│       │   │       ├── dashboard.ts
│       │   │       ├── users.ts
│       │   │       ├── trades.ts
│       │   │       ├── blindbox.ts
│       │   │       ├── finance.ts
│       │   │       ├── agents.ts
│       │   │       ├── risk-control.ts
│       │   │       └── settings.ts
│       │   ├── services/
│       │   │   ├── htxPriceEngine.ts      # HTX 行情 + 风控微调
│       │   │   ├── tradeEngine.ts         # 合约交易引擎
│       │   │   ├── settlementEngine.ts    # 异步结算引擎 (BullMQ)
│       │   │   ├── blindboxEngine.ts      # 盲盒抽奖 (加权随机 + 保底)
│       │   │   ├── walletService.ts       # 钱包余额管理
│       │   │   ├── nowpayService.ts       # NOWPayments 充提集成
│       │   │   ├── agentService.ts        # 代理返佣计算
│       │   │   ├── riskService.ts         # 风控规则引擎
│       │   │   ├── aiService.ts           # AI 分析 & 异常检测
│       │   │   ├── notificationService.ts # 多渠道通知 (Email+TG+WebPush+站内信)
│       │   │   ├── otpService.ts          # TOTP 2FA 服务
│       │   │   ├── antifraudService.ts    # 反欺诈 (设备指纹+IP风控+行为检测)
│       │   │   ├── ticketService.ts       # 工单客服系统
│       │   │   ├── storageService.ts      # S3/R2 对象存储
│       │   │   ├── geoService.ts          # IP地域检测 + 地域封禁
│       │   │   └── kycService.ts          # KYC验证服务(可选)
│       │   ├── ws/
│       │   │   ├── priceStream.ts         # 行情WS推送
│       │   │   └── userStream.ts          # 订单/通知WS推送
│       │   ├── jobs/                      # BullMQ 异步任务
│       │   │   ├── settlement.worker.ts   # 合约结算 Worker
│       │   │   ├── commission.worker.ts   # 佣金结算 Worker
│       │   │   ├── statistics.worker.ts   # 数据统计 Worker
│       │   │   ├── notification.worker.ts # 多渠道通知 Worker
│       │   │   ├── antifraud.worker.ts    # 反欺诈异步分析 Worker
│       │   │   └── backup.worker.ts       # 数据库定时备份 Worker
│       │   └── utils/
│       ├── drizzle.config.ts         # Drizzle Kit 配置
│       ├── tsconfig.json
│       └── package.json
│
└── README.md
```

---

## 三、功能模块化 & 动态开关架构

盲盒和期权交易作为独立可插拔模块，后台可实时开启/关闭，关闭后前端完全隐藏、API 拒绝访问。

### 3.0 Feature Toggle 设计

**后端实现**：
- `system_config` 表存储功能开关：
  - `feature.trade.enabled` = `true` | `false`
  - `feature.blindbox.enabled` = `true` | `false`
  - 可扩展更多模块：`feature.agent.enabled`、`feature.ai_assistant.enabled` 等
- 缓存策略：配置读取走 Redis 缓存，后台修改时通过 Redis Pub/Sub 广播失效，即时生效
- 中间件拦截：`featureGuard('trade')` / `featureGuard('blindbox')` Hono 中间件
  - 功能关闭时：API 返回 `403 { error: '该功能已关闭' }`
  - 功能关闭时：开放中的交易订单仍继续结算（不影响已有订单）

```typescript
// 示例：路由层使用
const tradeRoutes = new Hono()
  .use('*', featureGuard('trade'))  // 所有交易接口统一拦截
  .post('/open', ...)
  .get('/positions', ...)

const blindboxRoutes = new Hono()
  .use('*', featureGuard('blindbox'))
  .get('/list', ...)
  .post('/open', ...)
```

**前端实现**：
- 提供公开 API：`GET /api/config/features` → 返回所有功能开关状态
  ```json
  { "trade": true, "blindbox": false, "agent": true, "ai_assistant": true }
  ```
- 前端在应用初始化时拉取功能配置 → 存入 Zustand store
- 路由层：关闭的模块不注册路由，直接 redirect 到首页
- 导航栏 / Tab Bar：根据功能开关动态显示/隐藏菜单项
- 组件层：提供 `<FeatureGate feature="trade">` 包裹组件，关闭时不渲染子内容

```tsx
// 示例：前端功能门控
function FeatureGate({ feature, children, fallback = null }) {
  const features = useFeatureStore(s => s.features)
  if (!features[feature]) return fallback
  return children
}

// 使用
<FeatureGate feature="blindbox">
  <NavItem to="/blindbox" icon={Box} label="盲盒商城" />
</FeatureGate>
```

**后台管理**：
- 系统设置页 → 功能模块开关卡片（Switch 组件）
- 开启/关闭时确认弹窗 + 操作日志
- 关闭交易时显示当前未结算订单数（提示：关闭后新订单将被拒绝，已有订单正常结算）

---

## 四、核心功能模块详细设计

### 4.1 混合行情引擎（HTX + 风控层）

```
HTX WS API (真实数据) → 风控微调层 → Redis 缓存 → WS/SSE 推送 → 前端 Lightweight Charts
```

- **HTX 数据接入**：
  - WS: `wss://api.huobi.pro/ws` — 实时行情（需处理 gzip 压缩 + pong 心跳）
  - REST: `https://api.huobi.pro/market/history/kline` — 历史K线
  - 订阅：`market.{symbol}.kline.1min` / `market.{symbol}.trade.detail` / `market.{symbol}.depth.step0`
  - 交易对：btcusdt, ethusdt, solusdt, dogeusdt, xrpusdt, adausdt 等（后台可配）

- **风控微调参数**（后台实时可调）：
  - `priceOffsetBps`：价格偏移（基点，1bp = 0.01%）
  - `volatilityScale`：波动率缩放系数（0.5 ~ 2.0）
  - `delayMs`：行情延迟（0 ~ 5000ms）
  - `trendBias`：结算窗口内方向偏移权重
  - `spreadMarkup`：点差加成
  - 参数按交易对独立配置，变更即时生效（Redis Pub/Sub 广播）

- **数据流水线**：
  - HTX WS → 解压(pako) → 风控微调 → Redis Stream 存储 → 聚合1min/5min/10min K线
  - 前端订阅：WS 推送 tick + 更新的K线蜡烛
  - 断线重连：自动重连 + 补数据

### 4.2 合约期权交易（可关闭模块）

| 属性 | 说明 |
|------|------|
| **交易类型** | 看涨(Call) / 看跌(Put) |
| **周期** | 1分钟、5分钟、10分钟（后台可扩展 15/30/60 分钟） |
| **交易对** | 后台可配，默认 BTC/ETH/SOL/DOGE/XRP/ADA |
| **下注范围** | 最低/最高由后台配置（默认 10 ~ 10000 USDT） |
| **赔率** | 可按 交易对×周期×方向 独立配置（默认 85%收益率） |
| **结算规则** | 到期价 > 开仓价 = 涨赢 / < 开仓价 = 跌赢 / = 退回本金 |
| **连续下单** | 支持同一交易对多笔并行持仓 |
| **风控** | 单用户最大总持仓、单笔限额、单方向限额、平台总敞口限制、异常频率检测 |

**交易流程**：
1. 前端：选交易对 → 选方向 → 选周期 → 输入金额 → 一键下单
2. 后端：Zod 验证 → 风控检查 → 余额冻结(事务) → 创建订单 → BullMQ 调度结算任务
3. 结算 Worker：到期取价 → 判定盈亏 → 更新余额(事务) → 计算代理佣金
4. 全程 WS 推送：下单确认 → 倒计时同步 → 结算结果

### 4.3 商品盲盒系统（可关闭模块）

- **盲盒管理**（后台配置）：
  - 盲盒系列 CRUD（名称、封面、价格、标签、限时/限量）
  - 奖品池配置（商品信息 + 稀有度 + 概率 + 库存）
  - 稀有度：`Common(40%)` / `Rare(30%)` / `Epic(20%)` / `Legendary(8%)` / `Mythic(2%)`（默认概率仅示例）
  - 概率自动校验（和 = 100%），支持导入/导出配置

- **抽奖引擎**：
  - 密码学安全随机（`crypto.randomBytes`）+ 加权随机分配
  - 服务端种子 + 可验证公平性（可选，对外公开哈希）
  - 库存实时扣减（Redis + PG 双写）
  - **保底机制**：连续 N 次未出 Epic+ → 概率线性提升直至保底触发
  - 全站实时开箱广播（WS 推送最近 N 条记录，营造热度）

- **用户功能**：
  - 盲盒商城（瀑布流/分类/排序/标签/热门/限时）
  - 购买 → 3D 开箱动画（Framer Motion + CSS 3D Transform）
  - 奖品处理：存入背包 / 一键兑换为 USDT 余额
  - 背包管理：查看已获得物品、兑换历史
  - 开箱记录 + 全站中奖广播弹幕

### 4.4 用户钱包 & NOWPayments 充提

NOWPayments（https://nowpayments.io）— 150+ 币种加密货币支付网关。

- **充值流程**：
  1. 用户选择金额 + 支付币种（USDT-TRC20/BTC/ETH/USDC 等）
  2. `POST /v1/invoice` 创建发票 → 返回付款地址 + 二维码
  3. 前端展示付款页（地址、金额、二维码、有效期倒计时、实时状态轮询）
  4. IPN Webhook 回调 → HMAC-SHA512 签名验证 → 状态机更新 → 确认到账加余额
  5. 状态流转：`waiting → confirming → confirmed → finished` / `expired` / `failed`

- **提现流程**：
  1. 用户提交：币种 + 链 + 地址 + 金额 + 资金密码 + 2FA验证
  2. 系统校验：余额 ≥ 金额+手续费 → 冻结资金 → 创建提现单
  3. 管理员审核（后台显示风险评分 + 用户画像）
  4. 审核通过 → `POST /v1/payout` 调用 NOWPayments Payout / 管理员手动转账
  5. 完成后解冻 → 扣除余额 → 记录流水

- **安全机制**：
  - IPN 签名验证 + 金额二次核对（防篡改）
  - 资金密码（bcrypt 哈希，独立于登录密码）
  - 提现需 2FA TOTP 验证
  - 24h 提现次数 & 金额限制（后台可配）
  - 大额提现自动触发人工审核
  - 完整资金流水审计日志

### 4.5 认证 & 安全体系（2026 标准）

- **Passkey / WebAuthn 无密码登录**：
  - 注册时可选择创建 Passkey（指纹/面部/硬件密钥）
  - 登录一键 Passkey 验证，零密码泄露风险
  - 兼容 Apple/Google/Windows 生态同步 Passkey
  - 降级方案：传统用户名+密码登录

- **双 Token 认证**：
  - Access Token (15min) + Refresh Token (7d, httpOnly cookie)
  - Token 轮换：Refresh 使用后立即签发新 Refresh Token
  - 设备管理：可查看和踢出登录设备

- **2FA / TOTP**：
  - Google Authenticator / Authy 兼容
  - 资金操作（提现、修改密码）强制要求 2FA

- **风险控制**：
  - 登录异地/新设备检测 → 邮件/短信确认
  - 接口限流：滑动窗口算法 (Redis)
  - 暴力破解防护：连续失败锁定
  - CORS 白名单 + CSRF Token + CSP Header

### 4.5.1 反欺诈 & 防刷体系

- **设备指纹**（FingerprintJS Pro）：
  - 注册/登录时采集设备指纹 → 关联 user_id
  - 检测同一设备多账号（防多号刷优惠/对冲）
  - 设备风险分级：新设备 / 已知设备 / 高风险设备

- **IP 风控**：
  - 对接 IP 风险库（IPQualityScore / ip-api 等）
  - 检测 VPN/代理/Tor 访问 → 标记风险
  - 后台可配 IP 黑名单 / 白名单

- **行为检测**：
  - 盲盒高频购买检测（短时间内大量开箱 → 触发人机验证）
  - 充值洗钱检测：小额分散充值 + 快速提现模式识别
  - 交易对冲检测：同设备/IP 不同账号反向下单
  - 异常触发 → BullMQ 异步分析 → 自动标记 + 后台告警

### 4.5.2 合规 & KYC 模块

- **地域封禁**（后台可配）：
  - 基于 IP 地理位置封禁特定国家/地区访问
  - 封禁后展示“您所在地区不可用”页面
  - 后台维护封禁国家列表（复选框）

- **KYC 验证**（可选开启，feature toggle 控制）：
  - L0：无 KYC，仅允许小额交易/充提
  - L1：身份证照片上传 + 姓名，解锁更高额度
  - L2：视频验证（未来可对接第三方 KYC 服务如 Sumsub/Onfido）
  - 后台审核 KYC 申请（通过/拒绝/补充材料）

- **用户协议 & 风险提示**：
  - 注册时强制同意《用户服务协议》+《风险揭示》
  - 交易页展示风险提示横幅
  - 后台可编辑协议内容（富文本编辑器）

### 4.6 AI 辅助功能（2026 差异化特性，可关闭模块）

- **AI 行情分析助手**（用户端）：
  - 接入 LLM API（OpenAI / DeepSeek / 本地部署）
  - 用户可询问："BTC 近期走势如何？"→ AI 结合K线数据回答
  - 技术指标解读（MA/RSI/MACD）+ 自然语言总结
  - 声明：仅供参考，不构成投资建议

- **AI 异常交易监控**（管理后台）：
  - 自动检测异常模式：高频下单、大额连赢、疑似对冲
  - 风险评分系统：标记高风险用户
  - 自动告警 → 管理员审查

- **AI 智能客服**（可选）：
  - 基于 FAQ 知识库的自动回答
  - 充值/提现状态查询
  - 无法解决时转人工

### 4.7 代理分销系统（可关闭模块）

- **三级代理体系**：
  - 注册时填写邀请码 → 建立上下级关系
  - 佣金来源：下级用户交易手续费（平台抽水）的百分比
  - L1: 默认30% / L2: 默认20% / L3: 默认10%（后台可配）
  - 佣金实时计算，T+1 自动结算到代理钱包

- **代理推广中心**（用户端页面）：
  - 个人邀请码 + 邀请链接（含UTM追踪）
  - 邀请海报生成（canvas 动态渲染）
  - 团队成员列表（下级数量、活跃度）
  - 佣金统计（今日/本周/本月/总计）
  - 佣金明细 & 提现

### 4.8 客服 & 工单系统

- **内建工单系统**：
  - 用户端：提交工单（类型：充值问题/提现问题/账户问题/功能建议/其他）+ 附件上传
  - 后台：工单队列 + 分配 + 回复 + 状态流转（待处理 → 处理中 → 已解决 → 已关闭）
  - 工单关联用户画像（查看工单提交者的交易/充提记录）
  - SLA 监控：平均响应时间、解决率统计

- **在线客服（可选）**：
  - 集成 Crisp / Tawk.to 第三方在线客服插件
  - 或 AI 智能客服作为一线响应，无法解决自动创建工单

### 4.9 多渠道通知系统

| 渠道 | 触发场景 | 技术方案 |
|--------|---------|----------|
| **站内信** | 所有通知 | PG 存储 + WS 实时推送 |
| **WebPush** | 充值到账、交易结算、工单回复 | Service Worker + VAPID |
| **邮件** | 注册欢迎、异地登录、提现审核结果、安全提醒 | Nodemailer + SMTP (Resend/SES) |
| **Telegram Bot** | 运营告警（大额提现、异常交易、系统错误）+ 用户可选绑定 | Telegram Bot API |

- 后台可配置每种事件走哪些渠道（事件-渠道矩阵配置）
- 通知发送通过 BullMQ 异步队列，不阻塞主流程
- 用户在个人设置中可管理通知偏好（开/关各渠道）

### 4.10 管理后台功能矩阵

| 模块 | 功能 |
|------|------|
| **实时看板** | 在线人数、今日注册/活跃、交易量、充提额、盲盒销售、平台盈亏、地域分布热力图 |
| **用户管理** | 列表/搜索/筛选、详情画像、余额调整、封禁/解封、设备指纹关联、登录日志 |
| **交易管理** | 全部订单、实时持仓监控、盈亏分析图表、异常订单标记 |
| **行情风控** | 风控参数实时调整、赔率矩阵、限额设置、紧急暂停、AI 告警 |
| **盲盒管理** | 系列/奖品 CRUD、概率可视化编辑、库存监控、中奖大屏 |
| **资金管理** | 充值记录、提现审核队列、资金流水、异常资金告警、洗钱检测标记 |
| **代理管理** | 代理树形结构、佣金配置、结算日志、业绩排行 |
| **反欺诈** | 设备指纹管理、IP 黑白名单、风险用户标记、异常行为日志 |
| **工单客服** | 工单队列、分配、回复、SLA 统计、关联用户画像 |
| **合规管理** | KYC 审核队列、地域封禁配置、用户协议编辑、风险提示配置 |
| **通知中心** | 站内公告、多渠道推送管理、事件-渠道矩阵配置 |
| **系统设置** | 站点信息、**功能模块开关**、交易对开关、维护模式、API Key 管理、存储/CDN 配置 |
| **数据报表** | 日/周/月报、用户漏斗、留存率、LTV、CSV/PDF 导出 |
| **操作日志** | 不可篡改审计日志，按人/模块筛选 |

---

## 五、数据库设计（PostgreSQL 17 + Drizzle ORM）

### 用户与认证
- **users** — (id, username, email, phone, password_hash, fund_password_hash, avatar, balance, frozen_balance, invite_code, parent_id, role, status, language, created_at, updated_at)
- **passkeys** — (id, user_id, credential_id, public_key, counter, device_type, created_at)
- **user_totp** — (id, user_id, secret_encrypted, enabled, created_at)
- **user_sessions** — (id, user_id, refresh_token_hash, device_info, ip, expires_at, created_at)
- **login_logs** — (id, user_id, ip, device, geo_location, success, created_at)

### 交易
- **trades** — (id, user_id, symbol, direction, amount, duration, entry_price, exit_price, payout_rate, profit, status, created_at, settle_at, settled_at)
- **trade_risk_config** — (id, symbol, duration, direction, payout_rate, max_single_bet, max_total_exposure, enabled, updated_at)

### 盲盒
- **blindboxes** — (id, name, price, cover_url, description, tags, is_active, is_limited, limit_count, sold_count, start_at, end_at, sort_order, created_at)
- **blindbox_products** — (id, name, image_url, description, rarity, value, created_at)
- **blindbox_items** — (id, blindbox_id, product_id, probability, stock, initial_stock)
- **blindbox_records** — (id, user_id, blindbox_id, product_id, action, created_at)
  - action: 'kept' | 'exchanged'
- **user_inventory** — (id, user_id, product_id, source_record_id, status, created_at)
  - status: 'owned' | 'exchanged'

### 资金
- **deposits** — (id, user_id, nowpay_invoice_id, nowpay_payment_id, order_id, pay_currency, pay_amount, price_amount, actually_paid, outcome_amount, status, ipn_raw, created_at, confirmed_at)
- **withdrawals** — (id, user_id, currency, network, to_address, amount, fee, nowpay_payout_id, status, risk_score, reviewed_by, review_note, reviewed_at, created_at)
- **wallet_logs** — (id, user_id, type, amount, balance_before, balance_after, ref_type, ref_id, description, created_at)

### 代理
- **agents** — (id, user_id, parent_id, level, l1_rate, l2_rate, l3_rate, total_commission, created_at)
- **commissions** — (id, agent_id, from_user_id, trade_id, level, trade_amount, commission_rate, commission_amount, settled, settled_at, created_at)

### 客服 & 工单
- **tickets** — (id, user_id, type, subject, status, priority, assigned_to, created_at, updated_at, closed_at)
- **ticket_messages** — (id, ticket_id, sender_type, sender_id, content, attachments, created_at)

### 通知
- **notifications** — (id, user_id, type, channel, title, content, is_read, ref_type, ref_id, created_at)
- **notification_preferences** — (id, user_id, event_type, email, webpush, telegram, in_app)
- **user_telegram** — (id, user_id, telegram_chat_id, verified, created_at)

### 反欺诈 & 合规
- **device_fingerprints** — (id, user_id, fingerprint_hash, device_info, risk_level, first_seen, last_seen)
- **ip_blacklist** — (id, ip_or_cidr, reason, created_by, created_at)
- **geo_blocks** — (id, country_code, country_name, enabled, updated_by, updated_at)
- **kyc_applications** — (id, user_id, level, real_name, id_type, id_number, id_front_url, id_back_url, selfie_url, status, reviewed_by, review_note, created_at, reviewed_at)
- **user_agreements** — (id, user_id, agreement_type, version, agreed_at, ip)

### 系统
- **announcements** — (id, title, content, type, priority, is_active, start_at, end_at, created_by, created_at)
- **system_config** — (key, value, description, updated_at, updated_by)
  - 功能开关: `feature.trade.enabled`, `feature.blindbox.enabled`, `feature.agent.enabled`, `feature.ai_assistant.enabled`
  - 合规配置: `compliance.kyc.enabled`, `compliance.kyc.required_level`
  - 通知配置: `notification.email.enabled`, `notification.telegram.enabled`
- **admin_logs** — (id, admin_id, module, action, target_type, target_id, detail_json, ip, created_at)

### 索引策略
- trades: (user_id, status), (symbol, created_at), (settle_at) WHERE status='open'
- wallet_logs: (user_id, created_at), (type, created_at)
- deposits/withdrawals: (user_id, status), (nowpay_invoice_id)
- commissions: (agent_id, settled), (from_user_id)

---

## 六、安全、合规 & 可观测性（2026 标准）

### 安全防护
- **认证**：Passkey(WebAuthn) + JWT双Token + TOTP 2FA + 设备指纹(FingerprintJS)
- **传输**：HTTPS 强制 (HSTS) + TLS 1.3 + WSS
- **接口**：CORS 白名单 + CSRF Token + CSP + Rate Limiting (Redis sliding window)
- **数据**：资金密码 bcrypt、TOTP密钥 AES-256-GCM、PII 脱敏
- **支付**：NOWPayments IPN HMAC-SHA512 + 金额二次核对
- **反欺诈**：设备指纹多号检测 + IP风控库 + 行为分析 + 洗钱检测
- **审计**：所有管理员操作 + 所有资金变动 → 不可删除日志
- **依赖**：pnpm audit + Renovate/Dependabot 自动更新
- **密钥**：环境变量 + .env 不入库 + Docker Secrets (生产)

### 合规
- 地域 IP 封禁（后台可配国家列表）
- KYC 分级验证（可选开启，L0/L1/L2）
- 用户协议 + 风险揭示（注册强制同意）
- 交易风险提示横幅

### 可观测性
- **链路追踪**：OpenTelemetry SDK → Grafana Tempo
- **指标监控**：Prometheus 指标 → Grafana Dashboard
  - 业务指标：充值成功率、结算延迟、WS 连接数、在线用户数
  - 系统指标：CPU/内存、QPS、响应时间、错误率
- **错误追踪**：Sentry → 实时异常捕获 + 上下文 + 源码映射
- **日志聚合**：Grafana Loki → 结构化日志查询、关联 traceId
- **健康检查**：`GET /healthz` → 返回 PG/Redis/HTX WS 连接状态
- **告警规则**：
  - 充值成功率 < 90% → Telegram 告警
  - 结算延迟 > 10s → 告警
  - 错误率 > 5% → 告警
  - PG/Redis 连接失败 → 紧急告警

---

## 七、实施阶段划分

### Phase 1 — 基础架构搭建
- [ ] 清理现有文件，初始化 Turborepo + pnpm workspace
- [ ] 后端：Hono v4 + TypeScript + Drizzle ORM + PostgreSQL schema + 迁移
- [ ] 后端：JWT 双Token认证 + 密码注册/登录 + RBAC 中间件
- [ ] 后端：Feature Toggle 中间件 (`featureGuard`) + `GET /api/config/features` 接口
- [ ] 前端(web)：React 19 + Vite 6 + TailwindCSS v4 + 路由 + 布局框架
- [ ] 前端(web)：`<FeatureGate>` 组件 + Feature Store + 动态路由/导航
- [ ] 前端(web)：登录/注册页面 + 响应式布局（PC/Mobile 自适应）
- [ ] Docker Compose (PG + Redis) 开发环境
- [ ] packages/shared: 类型定义 + Zod 验证 schema

### Phase 2 — 核心交易系统
- [ ] 后端：HTX WebSocket 行情接入（gzip解压 + 心跳 + 重连）
- [ ] 后端：风控微调层 + Redis Stream 存储 + K线聚合
- [ ] 后端：合约交易引擎（开仓/BullMQ结算/风控规则）
- [ ] 后端：行情WS推送 + 订单状态WS推送
- [ ] 前端：交易大厅页面（Lightweight Charts K线 + 交易对选择 + 下单面板 + 持仓列表 + 倒计时）

### Phase 3 — 盲盒系统
- [ ] 后端：盲盒引擎（加权随机 + 保底 + 库存管理 + 兑换）
- [ ] 前端：盲盒商城页（展示 + 分类 + 标签 + 限时）
- [ ] 前端：开箱动画（3D翻转/粒子特效）+ 结果展示
- [ ] 前端：背包页 + 全站中奖广播

### Phase 4 — 钱包 & NOWPayments
- [ ] 后端：NOWPayments Invoice 创建 + IPN Webhook 处理 + 签名验证
- [ ] 后端：提现申请 + 审核流 + Payout API
- [ ] 前端：钱包页（余额、充值页、提现页、流水列表）

### Phase 5 — 安全 & 反欺诈 & 合规
- [ ] Passkey (WebAuthn) 注册/登录
- [ ] TOTP 2FA 绑定/验证
- [ ] 资金密码设置/验证
- [ ] 设备管理 + 异地登录提醒
- [ ] FingerprintJS 设备指纹采集 + 多号检测
- [ ] IP 风控库对接 + VPN/代理检测
- [ ] 行为异常检测（盲盒防刷、充值洗钱、交易对冲）
- [ ] 地域封禁功能（IP 地理检测 + 后台配置）
- [ ] KYC 模块（身份证上传 + 后台审核）
- [ ] 用户协议 & 风险提示页面

### Phase 6 — 管理后台
- [ ] admin 框架搭建（React 19 + Ant Design 6 + 权限路由）
- [ ] 实时数据看板（ECharts 图表 + WS实时更新）
- [ ] 用户管理 + 交易管理 + 行情风控面板
- [ ] 盲盒管理 + 资金审核
- [ ] 代理管理 + 佣金配置
- [ ] 反欺诈管理 + 工单客服管理
- [ ] 合规管理（KYC审核 + 地域封禁 + 协议编辑）

### Phase 7 — AI & 增值功能 & 多渠道通知
- [ ] AI 行情分析助手（LLM 接口 + 流式回答）
- [ ] AI 异常交易检测（管理后台告警）
- [ ] AI 智能客服（FAQ 知识库 + 自动创建工单）
- [ ] 代理推广中心（邀请海报 + 团队统计 + 佣金）
- [ ] 多渠道通知系统（邮件 + Telegram Bot + WebPush + 站内信）
- [ ] 用户通知偏好设置页面
- [ ] 工单系统前端（用户提交 + 查看回复）

### Phase 8 — 可观测性 & 高可用
- [ ] OpenTelemetry 全链路追踪 + Grafana Dashboard
- [ ] Sentry 错误追踪集成（前端 + 后端）
- [ ] Grafana Loki 日志聚合
- [ ] 健康检查端点 `/healthz`
- [ ] Telegram 运营告警 Bot（充值成功率/结算延迟/错误率告警）
- [ ] 数据库定时备份 (pg_dump + S3)
- [ ] PG 主从复制 + Redis Sentinel 配置文档
- [ ] 后端多实例 + Nginx 负载均衡配置

### Phase 9 — 打磨 & 上线
- [ ] 多语言（i18next：中/英/繁/日/韩）
- [ ] PWA 支持（manifest + Service Worker + 离线缓存）
- [ ] S3/R2 对象存储 + CDN 静态资源分发
- [ ] Vitest 单元测试 + Playwright E2E
- [ ] Docker 生产镜像 + nginx SSL + CI/CD
- [ ] 性能优化（代码分割、图片CDN、Redis缓存策略）
- [ ] 安全审计 & 渗透测试
- [ ] 部署文档 & 运维手册

---

## 八、关键技术决策说明

1. **Hono 替代 Express** — Hono v4 是 2025-2026 年增长最快的 Node.js 框架，12KB 超轻量，性能领先 Express 10x+，原生 TypeScript，内置 WebSocket/Validator/中间件，Edge/Node/Bun 全运行时兼容
2. **Drizzle ORM 替代 Prisma** — 2026 年 Drizzle 已成为主流选择：零代码生成、SQL-like 直觉 API、性能比 Prisma 快 3-5x、完全类型安全、迁移更灵活
3. **Turborepo + pnpm** — 2026 年 Monorepo 标配，前端/后台/后端共享类型和验证逻辑，增量构建大幅提升 CI 速度
4. **Passkey / WebAuthn** — 2026 年无密码登录已成主流，Apple/Google/Microsoft 全面支持 Passkey 同步，比密码安全且用户体验更好
5. **AI 集成** — 2026 年用户期望 AI 功能，行情分析助手和异常检测是差异化竞争力
6. **PWA** — 免 App Store 审核，一套代码覆盖 PC + Mobile + 可安装，TradingView 类产品 PWA 体验已接近原生
7. **NOWPayments** — 免自建链上基础设施，API 成熟，150+ 币种，Webhook 完善，适合快速上线
8. **HTX API** — 用户指定，公开行情无需 API Key，WebSocket 文档完善，数据可靠
9. **Feature Toggle 模块化** — 盲盒/交易/代理/AI 均为可插拔模块，后台一键开关，Redis Pub/Sub 即时广播，前端动态隐藏，API 层拦截拒绝，已有订单不受影响
10. **反欺诈体系** — FingerprintJS 设备指纹 + IP风控库 + 行为异常检测，多层防刷保护平台资金安全
11. **多渠道通知** — 站内信 + 邮件 + Telegram Bot + WebPush 四端触达，事件-渠道矩阵后台可配
12. **可观测性** — OpenTelemetry + Sentry + Loki + Grafana 全栈监控，业务指标告警确保运营稳定
13. **CDN & 对象存储** — Cloudflare R2/MinIO 存储盲盒图片、头像、KYC 文件，CDN 全球分发
