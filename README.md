# FlareTable（飞格多维表格）

**面向自动化（n8n）与智能体（AI Agents）原生的 Cloudflare 多维表格与结构化数据底座。**

FlareTable 参考飞书多维表格（Feishu Base）的强类型结构化数据模型与多视图交互体验，针对个人开发者与小团队的 Cloudflare Workers Paid（\$5/月）套餐进行了深度原生优化。它不仅是一个可在浏览器中实时协作的 Web 多维表格，更是一套自带 **OpenAPI 3.1 规范**、**按字段名/ID 双模式读写**、**幂等 Upsert**、**Reliable Queues HMAC Webhook** 与 **原生 MCP Server (`/mcp`)** 的自动化数据引擎。

---

## 核心特性

1. **多维表格核心引擎（Per-Base SQLite Durable Objects）**
   - 每个多维表格空间（Base）独占一个启用 SQLite 引擎的 Durable Object 实例（`BaseEngineDO`），物理隔离空间数据并消除跨网络往返延迟。
   - **13 种强类型字段**：文本（`text`）、数字（`number`）、单选（`single_select`）、多选（`multi_select`）、日期（`date`）、复选框（`checkbox`）、链接（`url`）、邮箱（`email`）、JSON 对象（`json`）、附件（`attachment`）、表间双向关联（`link`）、查找引用（`lookup`）与安全公式计算（`formula`）。
   - **安全公式 AST 引擎**：基于手写词法/语法分析器的无 `eval` 纯计算引擎，支持 `{字段名}` 引用、四则/比较运算与 `IF`/`CONCAT`/`ROUND`/`COALESCE` 等常用函数，并具备拓扑排序与循环引用检测（`#CYCLE!`）。
   - **四大交互视图**：高密度网格视图（Grid）、阶段看板视图（Kanban）、视觉卡片画廊（Gallery）、以及支持对外收集数据的公开表单（Form，独立 `/f/:shareToken` 页面）。

2. **Cloudflare Workers Paid (\$5/月) 原生特性全栈利用**
   - **Workers + Static Assets (`ASSETS`)**：单 Worker 托管前端 SPA 与 API 网关，静态请求免费且零跨域。
   - **D1 (`CONTROL_DB`)**：全局控制面存储工作区索引、公开表单路由、API Token 哈希、Webhook 订阅与投递审计日志。
   - **Durable Objects SQLite + Hibernatable WebSockets**：数据面与实时协同面合一，多人协同及 n8n/Agent 写入后前端秒级增量同步，空闲连接几乎零计费。
   - **Workers KV (`TOKEN_CACHE_KV`)**：边缘缓存 API Token 权限描述符（TTL 300s），毫秒级鉴权响应。
   - **Queues + DLQ (`AUTOMATION_QUEUE`)**：数据变更异步可靠分发至 Webhook，具备 `HMAC-SHA256` 签名、幂等投递 ID 与指数退避重试。
   - **R2 (`ATTACHMENTS_BUCKET`) + Cron (`0 3 * * *`)**：附件直存 R2 并内置 **2 GB 全局硬熔断守卫**，每日定时任务自动清理过期日志与孤儿对象，预留充足余量与同账户其他 R2 存储安全共存于 10 GB 免费额度内。

3. **n8n 与 AI Agents 一等公民集成**
   - **n8n 友好**：`/openapi.json` 与 `/docs` 交互文档开箱即用；接口支持 `fieldKeyType=name`（直接用中文列名写入），并提供 `POST /records/upsert` 幂等同步接口。
   - **AI Agents 原生 MCP**：Worker 原生内置 JSON-RPC 2.0 Streamable HTTP 端点 `/mcp`，无需额外搭建中间服务即可让 Claude、Cursor、OpenClaw 等智能体直接读表、建字段、检索与写入记录。

---

## 工程文档导航

| 文档 | 内容摘要 | 链接 |
| :--- | :--- | :--- |
| **01 产品需求文档 (PRD)** | 痛点分析、核心场景（内容中台/CRM/Agent记忆库/表单回收）、功能矩阵与非功能指标 | [docs/01-PRD.md](docs/01-PRD.md) |
| **02 系统架构设计** | Cloudflare 原生控制面/数据面分离架构、Mermaid 时序图、代码分层规范 | [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) |
| **03 数据库设计** | D1 全局控制面 6 表 DDL、DO SQLite 数据面 5 表 DDL、动态表达式索引与分数排序 | [docs/03-DATABASE-DESIGN.md](docs/03-DATABASE-DESIGN.md) |
| **04 自动化与 MCP 接入** | n8n HTTP/Upsert 实战、Webhook HMAC 验签代码、MCP Server 8 大工具规范 | [docs/04-AUTOMATION-OPENAPI-MCP.md](docs/04-AUTOMATION-OPENAPI-MCP.md) |
| **05 部署与成本守卫** | 本地开发、Wrangler 生产部署步骤、\$5 Paid 配额精算与 R2 2GB 硬熔断机制 | [docs/05-DEPLOYMENT-AND-COST.md](docs/05-DEPLOYMENT-AND-COST.md) |

---

## 快速本地启动

```bash
# 1. 安装工作区依赖
pnpm install

# 2. 运行全仓类型检查与后端引擎单元测试
pnpm typecheck
pnpm test

# 3. 构建前端静态资源并启动本地 Cloudflare Workers 全栈运行时
pnpm build
pnpm dev
```

启动后访问：
- **Web 多维表格工作台**：`http://127.0.0.1:8787/`
- **Scalar OpenAPI 交互文档**：`http://127.0.0.1:8787/docs`
- **OpenAPI 3.1 JSON 规范**：`http://127.0.0.1:8787/openapi.json`
- **MCP Server 端点**：`http://127.0.0.1:8787/mcp`
