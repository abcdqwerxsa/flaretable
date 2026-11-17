# 05. 部署指南、Cloudflare \$5 Paid 成本精算与 R2 配额守卫

## 1. Cloudflare Workers Paid (\$5/月) 资源映射与成本精算

FlareTable 严格针对 Cloudflare \$5/月套餐自带免费额度设计，在个人及中小团队高强度自动化使用场景下，**几乎不产生超出基础 \$5 月费的额外账单**：

| Cloudflare 产品 | 在本系统中的用途 | \$5 Paid 基础套餐包含额度 | 成本控制策略 |
| :--- | :--- | :--- | :--- |
| **Workers + Static Assets** | 托管前端 SPA + 全部 API / MCP 路由 | 每月 1,000 万次请求 + 3,000 万 CPU ms；静态资源请求免费 | 前端打包产物体积紧凑；边缘直接拦截无效请求 |
| **Durable Objects (SQLite)** | 每空间独立表格存储引擎 + WebSocket 协同 | 每月 100 万次请求 + 40 万 GB-s 计算时长 + 5 GB 存储 | 使用 **Hibernatable WebSockets**，空闲长连零活跃时长计费 |
| **Cloudflare D1** | 全局控制面（空间注册表/Token/Webhook/台账） | 250 亿次行读取 + 5,000 万次行写入 + 5 GB 存储 | 高频数据放在 DO SQLite，D1 仅承载低频元数据与审计日志 |
| **Workers KV** | API Token 权限哈希边缘缓存 | 1,000 万次读 + 100 万次写 | 仅缓存有效 Token（TTL 300s），避免写放大 |
| **Cloudflare Queues** | 异步事件总线与 Webhook 重试队列 | 每月 100 万次操作（含投递与 DLQ） | 批处理（`max_batch_size: 10`）聚合并发消费 |
| **Cloudflare R2** | 多维表格 `attachment` 附件字段存储 | **每月 10 GB 存储免费** + 100 万次 A 类操作 | **全局硬熔断守卫（默认 2 GB）** + 每日 Cron 回收孤儿文件 |

---

## 2. R2 10 GB 免费层硬熔断守卫机制

为了彻底避免多维表格附件上传意外撑爆 R2 的 10 GB 免费额度而产生额外存储费用，同时为同账户下其他业务预留充足余量，我们在代码中内置了**硬性双层熔断机制**：

1. **环境变量配置 (`apps/worker/wrangler.jsonc`)**：
   - `MAX_R2_TOTAL_BYTES`：默认 `"2147483648"`（**2.00 GB 硬上限**），安全控制在 R2 10 GB 免费额度安全区内。
   - `MAX_ATTACHMENT_BYTES`：默认 `"26214400"`（单文件最大 **25 MB**）。
2. **上传前强拦截 (`storage-guard.ts`)**：
   每次执行上传前，Worker 先在 D1 `attachments` 表聚合计算当前已占用的总字节数。如果 `usedBytes + incomingSize > MAX_R2_TOTAL_BYTES`，立即拒绝并返回 HTTP `413 Payload Too Large`（错误码 `STORAGE_QUOTA_EXCEEDED`），**绝不向 R2 发起 `put()` 操作**。
3. **每日凌晨自动垃圾回收 (`cron-gc.ts`)**：
   每天 `03:00 UTC` 自动触发 Cron 任务：
   - 清理超过 30 天的 `webhook_deliveries` 投递历史日志，保持 D1 轻量；
   - 扫描标记删除或超期未被引用的孤儿附件记录，从 R2 存储桶与台账同步删除释放空间。

---

## 3. 本地开发与生产部署完整命令

### 3.1 本地开发（无需登录 Cloudflare，全套模拟 D1 / DO / KV / R2 / Queues）

```bash
# 安装依赖
pnpm install

# 构建前端并启动 Wrangler 本地全栈环境
pnpm build
pnpm dev
```

### 3.2 首次部署到 Cloudflare 生产环境

```bash
# 1. 登录 Cloudflare（如未登录）
npx wrangler login

# 2. 创建 D1 数据库并记录返回的 database_id
npx wrangler d1 create flaretable-control

# 3. 创建 KV 命名空间并记录返回的 id
npx wrangler kv namespace create TOKEN_CACHE_KV

# 4. 创建 R2 存储桶
npx wrangler r2 bucket create flaretable-attachments

# 5. 创建 Queues 主队列与死信队列
npx wrangler queues create flaretable-automation-events
npx wrangler queues create flaretable-automation-dlq
```

将上述返回的 `database_id` 与 KV `id` 填入 `apps/worker/wrangler.jsonc`，然后执行数据库迁移与部署：

```bash
# 6. 应用 D1 生产库迁移
pnpm --filter @flaretable/worker db:migrate:remote

# 7. （可选）设置管理端登录保护密码，不设置时工作台开放供私人域名或 Zero Trust Access 保护
npx wrangler secret put ADMIN_PASSCODE

# 8. 构建前端并发布 Worker
pnpm deploy
```

> **安全建议**：生产环境下强烈建议配置 Cloudflare Zero Trust Access 保护 `/` 工作台页面，或者通过 `wrangler secret put ADMIN_PASSCODE` 启用管理口令；与此同时，`/api/v1/*` 与 `/mcp` 始终可通过细粒度 `Bearer ft_live_...` API Token 独立供 n8n 与 AI Agents 安全调用。
