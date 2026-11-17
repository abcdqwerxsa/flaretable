# 02. 系统架构设计 — Cloudflare Workers Paid 原生全栈架构

## 1. 总体架构思想：控制面与数据/协同面物理分离

FlareTable 放弃了“将全部租户和海量单元格塞进单一集中式数据库”的传统做法，而是最大化发挥 **Cloudflare Workers Paid (\$5/月)** 提供的高级有状态能力，采用**“轻量级全局控制面 + Per-Base SQLite Durable Object 数据与协同面”**的架构：

```mermaid
flowchart TB
    subgraph Clients["客户端与外部自动化生态"]
        Browser["Web 多维表格工作台 / 公开表单\n(React 19 + Tailwind v4)"]
        N8N["n8n 工作流 / 外部脚本\n(REST API + OpenAPI 3.1)"]
        Agent["AI Agents (Claude / OpenClaw / Cursor)\n(Streamable HTTP MCP)"]
    end

    subgraph EdgeWorker["Cloudflare Worker 单体接入网关 (Hono + Zod-OpenAPI)"]
        Assets["Static Assets (ASSETS)\n托管 React SPA 静态构建产物"]
        AuthMW["边缘鉴权中间件\nAdmin Session / Bearer API Token"]
        Router["REST API 网关 & /mcp 服务端\n/openapi.json & /docs"]
        PublicForm["公开表单网关\n/api/v1/public/forms/:shareToken"]
    end

    subgraph ControlPlane["全局控制面 (低频元信息与安全审计)"]
        KV["Workers KV (TOKEN_CACHE_KV)\nAPI Token 权限边缘缓存 TTL 300s"]
        D1["Cloudflare D1 (CONTROL_DB)\n空间索引 / Token哈希 / Webhook配置与日志 / 附件台账"]
        R2["Cloudflare R2 (ATTACHMENTS_BUCKET)\n附件对象存储 (2GB 全局硬熔断守卫)"]
    end

    subgraph DataPlane["数据面与实时协同面 (按 Base 物理隔离)"]
        DO["Durable Object: BaseEngineDO (SQLite)\n单空间独占实例 (base_id 路由)"]
        DOSQL["DO 本地 SQLite 引擎\ntables_meta / fields_meta / views_meta / records / record_links"]
        WS["Hibernatable WebSockets\n零空闲计费实时增量广播房间"]
    end

    subgraph AsyncPlane["异步可靠事件总线"]
        Queue["Cloudflare Queues\n(AUTOMATION_QUEUE + DLQ)"]
        Consumer["Queue 消费者 Worker\nHMAC-SHA256 签名 & 退避重试投递"]
        Cron["Cron Trigger (0 3 * * *)\n孤儿 R2 对象回收 & 过期日志清理"]
    end

    Browser -->|HTTPS / WSS| EdgeWorker
    N8N -->|REST + Bearer Token| Router
    Agent -->|JSON-RPC 2.0 POST /mcp| Router

    EdgeWorker --> Assets
    AuthMW <--> KV
    AuthMW --> D1
    Router --> D1
    Router <-->|上传前配额校验| R2
    Router -->|Stub RPC / WS 升级| DO
    PublicForm --> D1
    PublicForm -->|写入提交记录| DO

    DO <--> DOSQL
    DO <--> WS
    DO -->|事务提交后发送变更事件| Queue
    Queue --> Consumer
    Consumer -->|HMAC Webhook POST| N8N
    Consumer -->|写回投递状态与耗时| D1
    Cron --> D1
    Cron --> R2
```

---

## 2. 为什么选择 “Per-Base SQLite Durable Object”？

1. **零网络延迟的数据计算引擎**：
   在多维表格场景中，一次记录写入可能伴随类型校验、字段名到 `fld_xxx` 的映射、双向关联 `record_links` 同步以及后续的 `lookup` 与 `formula` 计算。在传统 Worker + 外部 DB 架构下需要多次跨区网络 RTT；而在 `BaseEngineDO` 内，Worker 代码与 SQLite 存储运行在**同一个边缘隔离实例与同一磁盘块**上，所有读写均通过同步事务（`storage.transactionSync`）原子完成，毫秒级返回。
2. **天然的租户级物理隔离与并发串行化**：
   每个 Base 对应唯一的 Durable Object ID（`idFromName(baseId)`），不同空间互不干扰、无锁争抢；同一空间内的并发写入与行级顺序 `rank` 分配天然由 DO 单线程事件循环序列化保障，绝不会出现脏读或版本号错乱。
3. **协同与数据同体（Hibernatable WebSocket）**：
   前端直接连入对应空间的 `BaseEngineDO` WebSocket 房间。使用 `this.ctx.acceptWebSocket(server)` 后，即使有数十个浏览器标签页长连挂机等待自动化通知，连接休眠期间**不产生 Durable Object 活跃计费时长**；一旦 n8n 或 Agent 写入一条新纪录，DO 在当前事务提交后即刻唤醒并广播增量事件给在线前端。

---

## 3. 核心请求与事件时序图

### 3.1 n8n 幂等写入 → 前端实时刷新 → 异步触发下游 Webhook

```mermaid
sequenceDiagram
    autonumber
    participant N8N as n8n 工作流
    participant GW as Worker 网关 (Auth + Router)
    participant KV as Workers KV
    participant DO as BaseEngineDO (SQLite)
    participant Web as 在线浏览器客户端
    participant Q as Cloudflare Queues
    participant Sub as 下游 Webhook 接收方

    N8N->>GW: POST /records/upsert (Bearer ft_live_..., fieldKeyType=name)
    GW->>KV: 查询 Token SHA-256 哈希缓存
    alt KV 未命中
        GW->>GW: 回源 D1 api_tokens 校验并写入 KV
    end
    GW->>DO: 转发 RPC 请求 (含操作人上下文)
    DO->>DO: SQLite 同步事务: 校验字段 + 匹配唯一键 + 插入/更新 + 维护双向关联
    DO-->>Web: Hibernatable WebSocket 广播 record.upserted
    DO->>Q: sendBatch(AutomationEvent)
    DO-->>GW: 返回已水合公式与 Lookup 的完整记录
    GW-->>N8N: 200 OK (JSON)
    Q->>Sub: 消费者读取 D1 订阅配置，附带 X-FlareTable-Signature-256 投递
```

---

## 4. 模块化代码分层设计

为保证高度可解释性、可测试性与未来扩展性，后端代码严格分为四层，禁止跨层耦合：

1. **共享契约层 (`packages/shared`)**：
   - 纯 TypeScript + Zod 定义，零平台绑定依赖。
   - 定义 ID 生成规范（语义前缀如 `base_`、`tbl_`、`fld_`、`rec_`）、13 种字段配置 Schema、筛选/排序 AST、视图契约、实时事件负载与 OpenAPI DTO。
2. **纯净表格领域引擎 (`apps/worker/src/base-engine/`)**：
   - 通过极简同步驱动接口 `SyncSqlDriver` 与 Cloudflare 运行时解耦。
   - 生产环境注入包装了 `ctx.storage.sql` 的 `DoSqlDriver`；单元测试则直接注入基于 Node v24 原生 `node:sqlite` 的 `NodeSqlDriver`。
   - 这使得全部公式解析、筛选 SQL 编译、双向关联和 `upsert` 核心算法可以在 Vitest 中毫秒级全覆盖验证，无需依赖脆弱的外部模拟。
3. **Cloudflare 控制面服务 (`apps/worker/src/control-plane/`)**：
   - 封装对 D1、KV、R2 的所有访问，包括幂等建表引导（`bootstrap.ts`）、API Token 生命周期管理、HMAC Webhook 投递器及 R2 2GB 硬熔断守卫。
4. **多协议接入层 (`routes/`, `mcp/`, `queue/`, `durable-objects/`)**：
   - REST/OpenAPI 路由仅做参数验证与权限拦截；
   - MCP Server 复用了同一套 `BaseEngineDO` RPC 与 `control-plane` 服务，保证通过 REST、UI 与 AI Agent 看到的 Schema、公式计算结果与触发的事件流 100% 一致。
