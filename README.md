# 加密货币合约期权交易 & 商品盲盒平台

> 2026 商业运营级方案 · React 19 / Hono v4 / Drizzle ORM / PostgreSQL 17 / Turborepo

## 技术栈

- **Monorepo**: Turborepo + pnpm workspace
- **后端**: Hono v4 + Node.js 20+ + Drizzle ORM + PostgreSQL 17 + Redis 7 + BullMQ
- **用户端**: React 19 + Vite 6 + TailwindCSS v4 + Lightweight Charts + Zustand
- **管理后台**: React 19 + Vite 6 + Ant Design 5 + ECharts
- **行情**: HTX WebSocket API + 风控微调层
- **支付**: NOWPayments API (150+ 加密货币)
- **认证**: JWT 双 Token + TOTP 2FA + 资金密码 + Passkey/WebAuthn + 设备指纹 (FingerprintJS) + CSRF
- **可观测**: Sentry (前后端) + OpenTelemetry + Prometheus + Grafana + Loki + Tempo + Alertmanager → Telegram

## 快速开始

### 前置依赖
- Node.js >= 20
- pnpm >= 9 (`npm i -g pnpm`)
- Docker & Docker Compose

### 启动步骤

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 安装依赖
pnpm install

# 3. 启动数据库 (PostgreSQL + Redis)
docker compose up -d

# 4. 初始化数据库 schema 和种子数据
pnpm db:migrate
pnpm db:seed

# 5. 启动开发环境 (并行启动 server / web / admin)
pnpm dev
```

### 默认账号
- 管理员：`admin@example.com` / `admin123456`（首次登录后请立即修改）
- 测试用户：注册任意账号即可

### 访问地址
- 用户端: http://localhost:5173
- 管理后台: http://localhost:5174
- 后端 API: http://localhost:3001

## 项目结构

```
e:\ppp\
├── apps/
│   ├── server/       # Hono 后端
│   ├── web/          # 用户端 (React 19)
│   └── admin/        # 管理后台 (React 19 + Ant Design)
├── packages/
│   ├── shared/       # 共享类型 / Zod schema / 常量
│   └── ui/           # 共享 UI 组件
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## 功能模块（后台可一键开关）

- ✅ 加密货币合约期权交易（1/5/10 分钟）
- ✅ 商品盲盒（加权随机 + 保底）
- ✅ NOWPayments 加密货币充提
- ✅ 三级代理分销
- ✅ AI 行情助手 / 异常监控
- ✅ 工单客服系统
- ✅ 多渠道通知（站内信 / 邮件 / Telegram / WebPush）
- ✅ 反欺诈（设备指纹 / IP 风控 / 行为检测）
- ✅ 合规（KYC / 地域封禁）

## 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 并行启动所有应用 |
| `pnpm dev:server` | 仅启动后端 |
| `pnpm dev:web` | 仅启动用户端 |
| `pnpm dev:admin` | 仅启动管理后台 |
| `pnpm build` | 全量构建 |
| `pnpm db:generate` | 生成 Drizzle 迁移 |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:seed` | 写入种子数据 |
| `pnpm lint` | 代码检查 |
| `pnpm typecheck` | 类型检查 |

## 安全配置须知

生产环境务必配置以下密钥（详见 `.env.example`）：

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`：使用 `openssl rand -base64 48` 生成
- `ENCRYPTION_KEY`：AES-256-GCM 主密钥，使用 `openssl rand -base64 32` 生成
- `NOWPAY_API_KEY` / `NOWPAY_IPN_SECRET`：从 NOWPayments 控制台获取
- `STORAGE_*`：对象存储凭证（Cloudflare R2 / AWS S3 / MinIO）
- `SMTP_*`：邮件发送
- `TELEGRAM_BOT_TOKEN`：运营告警
- `OPENAI_API_KEY`：AI 助手

## 生产部署 (Docker Compose)

```bash
# 1. 在服务器上克隆代码并配置 .env
cp .env.example .env
# 编辑 .env，至少修改 JWT_*_SECRET / ENCRYPTION_KEY / POSTGRES_PASSWORD

# 2. 一键构建并启动 (前端通过 nginx 提供，后端 Hono 容器化)
docker compose -f docker-compose.prod.yml up -d --build

# 3. 首次部署执行迁移与种子
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js
docker compose -f docker-compose.prod.yml exec server node dist/db/seed.js

# 4. 访问
#   用户端:  http://<host>:8080
#   管理后台: http://<host>:8081
```

`docker-compose.prod.yml` 包含 5 个服务：`postgres` / `redis` / `server` (Hono) / `web` (Vite + nginx) / `admin` (Vite + nginx)。两个前端 nginx 已通过 `proxy_pass http://server:3001` 将 `/api` 与 `/ws` 透传到后端，无跨域问题。

如需自建反向代理 / HTTPS，建议在前端 nginx 之外再加一层主入口 (Caddy / Traefik / nginx) 处理证书与域名分发。

## 架构亮点

- **Feature Toggle**：盲盒 / 交易 / 代理 / AI 等模块后台一键开关，Redis Pub/Sub 即时广播
- **HTX 行情 + 风控微调**：真实行情多周期 K 线（1/5/15/30/60min）+ 风控参数按交易对×周期独立配置（priceOffsetBps / trendBias / delayMs）
- **BullMQ 异步任务**：5 个 worker — 合约结算 / 通知推送 / 异常扫描 / 备份 / 佣金分发
- **多层资金安全**：bcrypt 资金密码 + TOTP 2FA + Passkey + 大额提现人工审核 + NOWPayments IPN HMAC 签名 + commissions 唯一索引防重发
- **AI 风控**：行为异常实时扫描（高频/对冲/大额/异地登录/可疑提现/盲盒高频），critical 自动 Telegram 告警
- **审计不可篡改**：管理员操作 + 资金变动全量入审计日志，支持 CSV 报表导出
- **可观测性**：/metrics (Prometheus) + OTLP traces (Tempo) + Loki 日志聚合 + Grafana 看板 + Alertmanager 业务告警 → Telegram
- **多语言**：用户端 5 语种（zh-CN / zh-TW / en / ja / ko），邮件模板 i18n 按用户偏好渲染

## 端到端测试

```bash
# 1. 启动 server + web (另开终端)
pnpm dev

# 2. 安装 Playwright 浏览器（首次）
pnpm --filter @app/e2e exec playwright install chromium

# 3. 运行 E2E
pnpm e2e
# 或交互式
pnpm e2e:ui
```

## 监控栈部署

```bash
docker compose -f docker-compose.monitoring.yml up -d
# Grafana:      http://localhost:3000  admin/admin
# Prometheus:   http://localhost:9090
# Alertmanager: http://localhost:9093
# Tempo:        http://localhost:3200
```

让 server 上报 trace：在 server 的 `.env` 设置 `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`。

让 Alertmanager 通过 server 转 Telegram：保持 `monitoring/alertmanager.yml` 中 webhook 指向 `http://host.docker.internal:3001/api/internal/alertmanager-webhook`，并配置 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPS_CHAT_ID`。

## 部署指南

| 场景 | 文档 |
|---|---|
| **国内宝塔面板部署**（最常见）| [docs/BAOTA_DEPLOY.md](./docs/BAOTA_DEPLOY.md) |
| **高可用 / 多副本生产部署** | [docs/HIGH_AVAILABILITY.md](./docs/HIGH_AVAILABILITY.md) |

## License

Proprietary - 商业运营授权
