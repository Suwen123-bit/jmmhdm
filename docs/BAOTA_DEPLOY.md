# 宝塔面板 (BT Panel) 部署指南

> 适用：CentOS 7+ / Ubuntu 20.04+ / Debian 11+ · 单机或主备
> 本指南假设你已安装好[宝塔面板](https://www.bt.cn/)（命令：`yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh`）。

---

## 一、最简部署：Docker Compose 方案（强烈推荐）⭐

> **优点**：5 分钟搞定；零依赖冲突；可与宝塔已有应用并存；升级/回滚一键 `docker compose pull`。

### 1.1 前置（在宝塔面板内完成）

| 步骤 | 路径 | 操作 |
|---|---|---|
| 安装 Docker | 软件商店 → 搜索 "Docker 管理器" → 安装 | 自动安装 docker + docker compose plugin |
| 防火墙开放端口 | 安全 → 放行 | 80 / 443 / 8080(临时) / 8081(临时) |
| 创建网站 | 网站 → 添加站点 | 域名填 `app.example.com`（用户端）、`admin.example.com`（后台），都选"静态" |
| 申请 SSL | 网站设置 → SSL → Let's Encrypt | 两个域名分别申请，开启强制 HTTPS |

### 1.2 上传代码

进入宝塔 **文件** 管理：

```bash
# 在 /www/wwwroot/ 下创建目录
mkdir -p /www/wwwroot/crypto-platform
cd /www/wwwroot/crypto-platform

# 用 git 拉取（推荐）
git clone <你的仓库地址> .

# 或直接上传打包好的源码 zip 解压
```

### 1.3 配置环境变量

```bash
cd /www/wwwroot/crypto-platform
cp .env.example .env
nano .env   # 或在宝塔文件管理器双击编辑
```

**至少必须修改以下 12 项**（参考 `.env.example` 注释）：

```ini
NODE_ENV=production
PUBLIC_API_URL=https://app.example.com
WEB_ORIGIN=https://app.example.com
ADMIN_ORIGIN=https://admin.example.com
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# 用 openssl rand -base64 48 生成下面三个秘钥
JWT_ACCESS_SECRET=<48 字符随机>
JWT_REFRESH_SECRET=<48 字符随机>
ENCRYPTION_KEY=<base64 32 字节> # openssl rand -base64 32

# NOWPayments 充值
NOWPAY_API_KEY=<在 NOWPayments 控制台获取>
NOWPAY_IPN_SECRET=<同上>

# NOWPayments 提现（独立账号）
NOWPAY_PAYOUT_API_KEY=
NOWPAY_PAYOUT_EMAIL=
NOWPAY_PAYOUT_PASSWORD=

# Passkey RP（必须改成你的真实域名）
PASSKEY_RP_ID=app.example.com
PASSKEY_ORIGIN=https://app.example.com

# 数据库密码
DATABASE_URL=postgresql://app:CHANGE_ME_STRONG@postgres:5432/crypto_platform
```

### 1.4 启动服务

```bash
cd /www/wwwroot/crypto-platform

# 一键启动 5 个容器（postgres + redis + server + web + admin）
docker compose -f docker-compose.prod.yml up -d --build

# 查看启动状态
docker compose -f docker-compose.prod.yml ps

# 首次部署执行数据库迁移 & 种子
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js
docker compose -f docker-compose.prod.yml exec server node dist/db/seed.js
```

执行完毕后：
- 用户端容器监听 `127.0.0.1:8080`
- 管理端容器监听 `127.0.0.1:8081`
- API 容器监听 `127.0.0.1:3001`

### 1.5 配置宝塔站点反向代理

**用户端站点**（`app.example.com`）：

宝塔面板 → 网站 → `app.example.com` → 设置 → **反向代理** → 添加：

| 字段 | 值 |
|---|---|
| 代理名称 | `web` |
| 目标 URL | `http://127.0.0.1:8080` |
| 发送域名 | `$host` |

然后 **配置文件** 中替换 / 追加：

```nginx
# 让 /api 和 /ws 直接打到后端 server 容器
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    client_max_body_size 20m;
}

location /ws {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
}

# /metrics 与 /health 仅内网（可选，强烈建议）
location /metrics {
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;
    proxy_pass http://127.0.0.1:3001;
}
location ~ ^/(health|health/ready)$ {
    proxy_pass http://127.0.0.1:3001;
    access_log off;
}
```

**管理端站点**（`admin.example.com`）：反向代理 `http://127.0.0.1:8081`，并按上面同样追加 `/api/` 与 `/ws` 块。

> ⚠️ 务必**点击宝塔右上角"重载配置"**让 Nginx 生效。

### 1.6 配置 NOWPayments IPN webhook

到 NOWPayments 控制台填写 IPN URL：

```
https://app.example.com/api/nowpay/ipn
```

### 1.7 验证

```bash
# 浅层
curl https://app.example.com/health

# 深度（PG + Redis + HTX）
curl https://app.example.com/health/ready | jq

# 公开配置
curl https://app.example.com/api/config/public | jq
```

打开浏览器：
- 用户端：https://app.example.com
- 后台：https://admin.example.com（默认账号 `admin@example.com / admin123456`，**首登立刻改密**）

---

## 二、原生方案（不用 Docker，用宝塔自带组件）

> 如果你的宝塔已经装了 Nginx / PostgreSQL / Redis 想复用，按这个走。

### 2.1 在宝塔安装组件

| 软件 | 版本 | 安装方式 |
|---|---|---|
| **Node.js 管理器** | 安装并选择 v20.x LTS | 软件商店 |
| **PM2 管理器** | 最新 | 软件商店 |
| **PostgreSQL** | **17.x**（必须 ≥14） | 软件商店（注意版本下拉选 17）|
| **Redis** | 7.x | 软件商店 |
| **Nginx** | 1.24+ | 软件商店（一般已默认装好）|

### 2.2 安装 pnpm

宝塔 → 终端：

```bash
# 切到 Node 管理器装的 node 路径
which node     # 例如 /www/server/nodejs/v20.18.0/bin/node
npm i -g pnpm@9
```

### 2.3 创建数据库

宝塔 → 数据库 → PostgreSQL → 添加数据库：

| 字段 | 值 |
|---|---|
| 数据库名 | `crypto_platform` |
| 用户名 | `app` |
| 密码 | `<强密码，记下来>` |
| 访问权限 | 本地 |

> 若宝塔列表里没看到 PostgreSQL 入口，说明组件未启动。先 **软件商店 → PostgreSQL → 启动**。

### 2.4 部署代码

```bash
mkdir -p /www/wwwroot/crypto-platform
cd /www/wwwroot/crypto-platform
git clone <repo> .

# 配置 .env（同 1.3，但 DATABASE_URL 改成本机：）
cp .env.example .env
nano .env
```

`.env` 中：

```ini
DATABASE_URL=postgresql://app:<强密码>@127.0.0.1:5432/crypto_platform
REDIS_URL=redis://127.0.0.1:6379
PORT=3001
```

### 2.5 安装 + 构建

```bash
cd /www/wwwroot/crypto-platform
pnpm install --prod=false
pnpm build         # turbo 全栈构建：shared + server + web + admin

# 跑迁移 + 种子
pnpm db:migrate
pnpm db:seed
```

### 2.6 用 PM2 启动后端

宝塔 → PM2 管理器 → **添加项目**：

| 字段 | 值 |
|---|---|
| 项目名 | `crypto-server` |
| 启动文件 | `/www/wwwroot/crypto-platform/apps/server/dist/index.js` |
| 项目目录 | `/www/wwwroot/crypto-platform/apps/server` |
| 启动模式 | `fork`（单实例）或 `cluster`（多核，推荐 = CPU 核数）|
| Node 版本 | v20.x |
| 启动参数 | 无 |
| 环境变量 | （把 `.env` 内容粘进来，或留空让 dotenv 加载）|

> 如果 PM2 不能识别 `.env`，可以在 `apps/server/src/index.ts` 顶部加一行 `import 'dotenv/config'`（已存在的项目可能已经做了，参考 `@/ppp/apps/server/src/config/env.ts`）。

或者命令行启动（更可控）：

```bash
cd /www/wwwroot/crypto-platform/apps/server
pm2 start dist/index.js --name crypto-server -i max --update-env
pm2 save                 # 持久化
pm2 startup             # 让 systemd 开机自启（按提示执行那一行 sudo）
```

### 2.7 部署前端静态文件

#### 用户端（`app.example.com`）

宝塔 → 网站 → 添加站点：

| 字段 | 值 |
|---|---|
| 域名 | `app.example.com` |
| 根目录 | `/www/wwwroot/crypto-platform/apps/web/dist` |
| PHP 版本 | 纯静态 |
| FTP / 数据库 | 不创建 |

申请 Let's Encrypt SSL（开启强制 HTTPS）。

打开 **配置文件**，把 `location /` 替换为 SPA 兜底，并追加 API/WS 反代（同 1.5 章节代码块）：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

# Service Worker 不缓存
location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

# 静态资源长缓存
location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# API/WS 转后端
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20m;
}
location /ws {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

#### 管理端（`admin.example.com`）

同上，根目录改成 `/www/wwwroot/crypto-platform/apps/admin/dist`。

### 2.8 重载 Nginx

宝塔 → 软件商店 → Nginx → **重载配置**（或终端 `nginx -s reload`）。

### 2.9 验证（同 1.7）

---

## 三、首次上线安全清单

部署完成后，**逐项确认**：

| # | 项 | 操作 |
|---|---|---|
| 1 | JWT/加密密钥 | 必须用 `openssl rand -base64 48` 重新生成 |
| 2 | 生产环境硬校验 | `NODE_ENV=production` 时启动会拒绝弱密钥 |
| 3 | 默认管理员密码 | 首登立刻改为强密码 + 启用 TOTP |
| 4 | NOWPayments IPN 密钥 | 必须填，否则启动失败 |
| 5 | NOWPAY_PAYOUT_* | 提现走 mass payout 必须配 |
| 6 | VAPID 密钥 | `npx web-push generate-vapid-keys` 生成 |
| 7 | TELEGRAM_BOT_TOKEN | 用于告警，强烈建议配 |
| 8 | SMTP_* | 邮件验证 / 安全告警渠道 |
| 9 | OPENAI_API_KEY | AI 助手（可留空，关闭 feature toggle） |
| 10 | STORAGE_* | KYC 证件文件上传必需（Cloudflare R2 / 阿里云 OSS / MinIO 都行）|
| 11 | 防火墙 | 关闭 3001 / 5432 / 6379 对外 |
| 12 | 宝塔面板自身 | 改默认端口 + 启用面板访问限制 |
| 13 | 启动日志 | `pm2 logs crypto-server --lines 100` 确认无 fatal |
| 14 | 健康检查 | `curl https://app.example.com/health/ready` 返回 200 |

---

## 四、可选：可观测性栈（监控）

如果服务器内存 ≥ 4GB：

```bash
cd /www/wwwroot/crypto-platform
docker compose -f docker-compose.monitoring.yml up -d
```

宝塔放行端口（仅内网或加 nginx Basic Auth 后再暴露）：
- 3000（Grafana）
- 9090（Prometheus）
- 9093（Alertmanager）

server `.env` 追加：

```ini
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=crypto-platform-api
```

PM2 重启 server：`pm2 restart crypto-server`。
访问 Grafana：`http://server-ip:3000`（admin/admin），看板 "Crypto Platform Overview" 已自动 provisioning。

---

## 五、常见问题

### 5.1 宝塔创建的 PostgreSQL 启动后端连不上

宝塔默认只允许 127.0.0.1 访问，确认 `.env` 的 `DATABASE_URL` 是 `127.0.0.1` 而不是 `localhost`（IPv6 解析会失败）。

### 5.2 Passkey 注册失败 `Invalid origin`

`PASSKEY_RP_ID` 必须是**裸主机名**（如 `app.example.com`，不要带 `https://`）；`PASSKEY_ORIGIN` 必须是**完整 URL**（如 `https://app.example.com`，无尾斜杠）。

### 5.3 WebSocket 连不上

宝塔旧版 Nginx 配置有时会缺 `proxy_set_header Upgrade ...`。检查站点配置文件 `/www/server/panel/vhost/nginx/<域名>.conf`，确保包含 §1.5 中的 `location /ws` 块。重载 nginx 后浏览器开发者工具应看到 `WS 101 Switching Protocols`。

### 5.4 NOWPayments IPN 不到账

```bash
# 实时跟后端日志
pm2 logs crypto-server | grep nowpay
# 或 docker
docker compose -f docker-compose.prod.yml logs -f server | grep nowpay
```

常见原因：
- IPN URL 没在 NOWPayments 后台填
- `NOWPAY_IPN_SECRET` 与控制台不一致
- nginx 把 `Content-Type` 改了导致签名失败 → 在站点 nginx 里**不要**对 `/api/nowpay/` 做缓存或 body 修改

### 5.5 数据库迁移失败

```bash
# 容器版
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js

# 原生版
cd /www/wwwroot/crypto-platform
pnpm --filter @app/server db:migrate
```

如果是字段变更冲突：先备份 → 手工 SQL 修复 → 在 `apps/server/src/db/migrations/` 添加补丁迁移。

### 5.6 升级到新版本

```bash
cd /www/wwwroot/crypto-platform

# 拉最新
git pull

# Docker 方案
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js

# 原生方案
pnpm install
pnpm build
pnpm db:migrate
pm2 restart crypto-server
```

无需停机（PM2 cluster 模式滚动重启；Docker 单容器会有 1-2 秒中断 → 配合 nginx `max_fails`/`fail_timeout` 重试）。

### 5.7 备份恢复

数据库备份（已自动每日 03:00 上传到 S3，由 BullMQ backup worker 触发）：

```bash
# 手动触发一次
docker compose -f docker-compose.prod.yml exec server node -e "import('./dist/services/backupService.js').then(m=>m.runDailyBackup())"

# 恢复（紧急）
aws s3 cp s3://your-bucket/backups/2026/04/26/db_xxx.dump ./db.dump
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore --clean --no-owner -d crypto_platform -U app < db.dump
```

---

## 六、性能调优（可选）

### 6.1 PostgreSQL（宝塔 → PostgreSQL → 配置文件）

```ini
shared_buffers = 1GB              # 内存的 25%
effective_cache_size = 3GB        # 内存的 75%
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 200
wal_buffers = 16MB
```

### 6.2 Redis

```ini
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 6.3 Nginx 全局（宝塔 → Nginx → 配置修改）

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;
events {
    worker_connections 8192;
    use epoll;
    multi_accept on;
}
http {
    keepalive_timeout 65;
    keepalive_requests 1000;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript application/x-javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_comp_level 5;
}
```

### 6.4 PM2 cluster

```bash
pm2 delete crypto-server
pm2 start /www/wwwroot/crypto-platform/apps/server/dist/index.js \
    --name crypto-server -i max --update-env --max-memory-restart 1G
pm2 save
```

`-i max` 表示按 CPU 核数启动多副本。注意 BullMQ worker 会每副本各一份，请把 worker 拆出独立进程（参考 `docs/HIGH_AVAILABILITY.md` §6）。

---

## 附：一键安装脚本

把下面保存为 `/www/wwwroot/install-crypto.sh` 并执行：

```bash
#!/bin/bash
set -e

REPO_URL="${REPO_URL:-https://your-git-server/repo.git}"
TARGET="/www/wwwroot/crypto-platform"

echo "=== Crypto Platform 自动部署 ==="

# 1. 拉代码
if [ ! -d "$TARGET" ]; then
  git clone "$REPO_URL" "$TARGET"
fi
cd "$TARGET"

# 2. 配置
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 48)|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
  echo "✅ 已生成 .env，请编辑补全 NOWPAY/SMTP/Storage 配置后再继续"
  echo "   nano $TARGET/.env"
  exit 0
fi

# 3. 启动
docker compose -f docker-compose.prod.yml up -d --build

# 4. 等就绪
echo "等待容器启动..."
sleep 15

# 5. 迁移
docker compose -f docker-compose.prod.yml exec -T server node dist/db/migrate.js
docker compose -f docker-compose.prod.yml exec -T server node dist/db/seed.js

echo "✅ 部署完成"
echo "   API: http://127.0.0.1:3001"
echo "   Web: http://127.0.0.1:8080"
echo "   Admin: http://127.0.0.1:8081"
echo ""
echo "👉 下一步：到宝塔创建网站 + 反向代理"
```

```bash
chmod +x /www/wwwroot/install-crypto.sh
REPO_URL=https://your-git/repo.git bash /www/wwwroot/install-crypto.sh
```
