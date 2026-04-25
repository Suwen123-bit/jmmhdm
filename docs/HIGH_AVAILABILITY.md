# 高可用部署指南

本文档描述把单实例部署升级为生产级 HA 部署所需的步骤。

## 1. 总体架构

```
              ┌──────────────────┐
              │  Cloudflare CDN  │
              └────────┬─────────┘
                       │
                ┌──────▼──────┐
                │   Nginx LB   │ (active/passive 两副本)
                └─────┬───────┘
                      │
        ┌─────────────┼──────────────┐
        │             │              │
   ┌────▼───┐    ┌────▼───┐     ┌────▼───┐
   │ api-1  │    │ api-2  │ ... │ api-N  │  (Hono / Node.js)
   └────┬───┘    └────┬───┘     └────┬───┘
        │             │              │
        └─────────────┼──────────────┘
                      │
        ┌─────────────┼──────────────┐
        │             │              │
   ┌────▼─────┐  ┌────▼─────┐   ┌───▼────────┐
   │ PG primary│ │ PG replica│   │ Redis Sentinel │
   │           │ │  (read)   │   │  + replicas    │
   └───────────┘ └───────────┘   └────────────────┘
```

## 2. PostgreSQL 主从

### 2.1 主库参数（`postgresql.conf`）

```ini
wal_level = replica
max_wal_senders = 5
hot_standby = on
synchronous_commit = on
synchronous_standby_names = 'replica1'
archive_mode = on
archive_command = 'aws s3 cp %p s3://my-bucket/wal/%f'
```

### 2.2 创建复制用户

```sql
CREATE USER replica REPLICATION LOGIN ENCRYPTED PASSWORD 'CHANGEME';
```

### 2.3 `pg_hba.conf`

```
host replication replica 10.0.0.0/16 scram-sha-256
```

### 2.4 从库初始化

```bash
pg_basebackup -h <primary> -D /var/lib/postgresql/data -U replica -P -Fp -Xs -R
```

### 2.5 应用读写分离

服务端可改成两路连接池：
- `DATABASE_URL` → 写主
- `DATABASE_REPLICA_URL` → 读从（dashboard / 报表 / 历史查询）

> 为简化，当前项目仅使用主库。引入读路由时，请在 `db/client.ts` 暴露 `dbRead`。

### 2.6 故障切换

推荐使用 [Patroni](https://patroni.readthedocs.io/) + etcd 自动选主。
若手动切换：

```bash
# 在 standby 上提升
pg_ctl promote -D /var/lib/postgresql/data
# 应用切换连接串
```

## 3. Redis Sentinel

### 3.1 部署 3 个 Sentinel 节点

```yaml
# sentinel.conf
port 26379
sentinel monitor mymaster 10.0.0.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel auth-pass mymaster CHANGEME
```

### 3.2 应用接入

ioredis 自带 Sentinel 支持：

```ts
new IORedis({
  sentinels: [
    { host: 'redis-sentinel-1', port: 26379 },
    { host: 'redis-sentinel-2', port: 26379 },
    { host: 'redis-sentinel-3', port: 26379 },
  ],
  name: 'mymaster',
  password: process.env.REDIS_PASSWORD,
});
```

把 `REDIS_URL` 改为上面的对象式构造，或新增 `REDIS_SENTINELS` 环境变量。

## 4. Nginx 负载均衡

```nginx
upstream api_backend {
  least_conn;
  server api-1:3001 max_fails=3 fail_timeout=30s;
  server api-2:3001 max_fails=3 fail_timeout=30s;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

  # WebSocket 升级
  location /ws {
    proxy_pass http://api_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
  }

  location / {
    proxy_pass http://api_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
  }

  # 健康检查（深度）
  location = /health/ready {
    proxy_pass http://api_backend;
    access_log off;
  }
}
```

## 5. WebSocket 多副本注意事项

当前广播通过 Redis Pub/Sub (`CHANNELS.USER_EVENT`)，每个 api 副本独立订阅，
所以多副本下用户消息会被自动路由（每个副本只发给本地连接的 userId）。

**Sticky Session 不必要**：Redis Pub/Sub 会让任何副本都能接收消息。
但为了减少跨副本延迟，可以在 LB 配置 `ip_hash` 让同一用户尽量落到同一副本。

## 6. BullMQ Worker 横向扩展

Worker 与 API 解耦，可独立伸缩：

```bash
# 可独立部署 worker-only 实例
NODE_ROLE=worker pnpm start
```

> 当前 `index.ts` 同时启动 worker 和 HTTP；如需分离，
> 请在 `bootstrap()` 内根据 `process.env.NODE_ROLE` 跳过 `serve()` 或 `startWorkers()`。

## 7. 备份 & 恢复

- **每日全量备份**：`backupQueue` cron `0 3 * * *` UTC，输出 S3 `backups/yyyy/MM/dd/db_*.dump`。
- **WAL 归档**：见 §2.1，可 PITR 到任意时间点。
- **恢复**：

```bash
aws s3 cp s3://my-bucket/backups/.../db_xxx.dump ./db.dump
pg_restore --clean --no-owner -d $DATABASE_URL db.dump
```

## 8. 滚动升级流程

1. 新版本镜像 build & push 到 registry
2. 一台 api 实例 drain（健康检查返回 503，由 LB 摘除）
3. 部署新版本
4. 等深度健康检查 200 → 重新加入 LB
5. 重复其他实例

> drain 可以通过临时 touch 文件让 `/health/ready` 返回 503；或在 `index.ts` 监听 SIGUSR1。

## 9. 容量规划参考

| 用户量 | 推荐配置 |
|---|---|
| 1k 日活 | 2 × api(1C2G) + PG(2C4G) + Redis(1G) |
| 10k 日活 | 4 × api(2C4G) + PG 主从(4C8G) + Redis Sentinel 3 节点 |
| 50k 日活 | 8 × api(4C8G) + PG 主从+只读副本 + Redis Cluster + 独立 worker(4 副本) |
| 100k+ 日活 | 16 × api + PG sharding 或 CockroachDB + 多区域部署 |
