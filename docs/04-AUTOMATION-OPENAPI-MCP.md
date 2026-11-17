# 04. 自动化、OpenAPI 与 AI Agents (MCP) 接入规范

FlareTable 从第一行代码起就将 **n8n 工作流**与 **AI Agents（Claude / Cursor / OpenClaw / n8n AI Agent）** 设计为一等公民。

---

## 1. n8n / HTTP 自动化接入核心优势

### 1.1 OpenAPI 3.1 一键导出与交互调试
- **OpenAPI 规范地址**：`GET /openapi.json`
- **Scalar 可视化文档**：`GET /docs`
- 所有路由均由 `@hono/zod-openapi` 自动生成强类型契约，n8n 的 HTTP Request 节点或自定义连接器可直接导入接口定义。

### 1.2 人类友好的双模式字段键 (`fieldKeyType`)
所有记录读写接口（查询、新建、更新、Upsert）均支持 `fieldKeyType` 参数：
- `fieldKeyType=name`（**默认推荐用于 n8n 与 Agent**）：直接使用表格里直观的中文字段名读写，如 `{"选题标题": "...", "优先级": "P0"}`。
- `fieldKeyType=id`（**推荐用于高稳定性系统集成**）：使用永不改变的字段 ID（`fld_xxx`）读写，即使运营人员在界面更改了列名也不会破坏脚本。在表格界面开启“显示字段 ID”即可一键复制。

### 1.3 幂等同步接口 (`POST .../records/upsert`)
在定时采集、RSS 聚合、订单同步、邮件入库等场景下，工作流重跑极易产生重复行。使用 `upsert` 接口可基于任意业务字段（如 `原文链接`、`客户邮箱`、`外部ID`）自动判断“存在则更新、不存在则新增”：

```bash
curl -X POST "https://your-domain.workers.dev/api/v1/bases/base_xxx/tables/tbl_xxx/records/upsert" \
  -H "Authorization: Bearer ft_live_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "fieldKeyType": "name",
    "matchField": "外部唯一ID",
    "records": [
      {
        "fields": {
          "外部唯一ID": "gh-issue-1024",
          "标题": "Cloudflare Durable Objects SQLite 实践",
          "状态": "待审校",
          "预估阅读数": 3500
        }
      }
    ]
  }'
```

响应体清晰返回每条记录的动作类型（`created` 或 `updated`）及统计汇总（`createdCount`、`updatedCount`），方便 n8n 后续节点按条件分流。

---

## 2. Outgoing Webhook 事件推送与 HMAC-SHA256 验签

当多维表格发生变更（无论来自 Web UI 人工编辑、公开表单提交、还是其他工作流），`BaseEngineDO` 会在事务提交后将事件推送至 `AUTOMATION_QUEUE`。

### 2.1 标准请求头与负载结构

- **Headers**：
  - `Content-Type: application/json`
  - `X-FlareTable-Event: record.created`（或 `record.updated` / `record.deleted` / `field.created` / `form.submitted` / `webhook.test`）
  - `X-FlareTable-Delivery-Id: del_01J...`（全局唯一投递幂等键，n8n 可据此做去重）
  - `X-FlareTable-Timestamp: 1763345434`（Unix 秒级时间戳）
  - `X-FlareTable-Signature-256: sha256=<hex_digest>`

- **签名计算规则**：
  $$\text{payloadToSign} = \text{timestamp} + \text{'.'} + \text{rawRequestBody}$$
  $$\text{signature} = \text{HMAC-SHA256}(\text{webhookSecret}, \text{payloadToSign})$$

- **Payload 示例**：
```json
{
  "deliveryId": "del_01JABCD...",
  "eventId": "evt_01JABCD...",
  "eventType": "record.created",
  "timestamp": "2026-11-17T02:50:34.120Z",
  "baseId": "base_01J...",
  "tableId": "tbl_01J...",
  "actor": { "type": "web", "label": "工作台管理员" },
  "data": {
    "record": {
      "id": "rec_01J...",
      "version": 1,
      "fields": { "fld_xxx": "..." },
      "fieldsByName": { "选题标题": "..." }
    }
  }
}
```

### 2.2 n8n Webhook 节点后置 HMAC 验签代码（可直接粘贴至 n8n Code Node）

```javascript
const crypto = require('crypto');

const secret = 'whsec_你的密钥';
const headers = $input.first().json.headers;
const rawBody = JSON.stringify($input.first().json.body); // 建议在 n8n Webhook 开启 Raw Body 获取精确字节

const ts = headers['x-flaretable-timestamp'];
const sigHeader = headers['x-flaretable-signature-256'] || '';

const expected =
  'sha256=' +
  crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');

// 使用恒定时间比较防止时序攻击
const valid =
  sigHeader.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));

if (!valid) {
  throw new Error('FlareTable Webhook 签名校验失败，拒绝执行后续节点！');
}

return $input.all();
```

---

## 3. 原生 MCP Server (`/mcp`) 接入规范

FlareTable Worker 直接实现了基于 **Streamable HTTP (JSON-RPC 2.0)** 的 Model Context Protocol 服务端，路径为 `/mcp`，使用与 REST API 相同的 `Authorization: Bearer ft_live_...` Token 鉴权。

### 3.1 内置工具清单（8 个标准化工具）

| 工具名 | 所需最低 Scope | 功能说明 |
| :--- | :--- | :--- |
| `list_bases` | `base:read` | 列出当前可用多维表格空间及其 ID、名称、表数量 |
| `get_base_schema` | `base:read` | 获取指定空间的全部数据表、字段定义（类型/选项/公式/关联）与视图配置，供 Agent 理解数据结构 |
| `query_records` | `records:read` | 支持按表名或表 ID、关键词搜索、结构化 `FilterGroup` 筛选与排序查询记录 |
| `create_records` | `records:write` | 批量写入新记录（默认支持中文列名） |
| `upsert_records` | `records:write` | 基于指定唯一字段执行批量幂等写入或更新 |
| `update_record` | `records:write` | 更新单行指定字段（局部更新） |
| `delete_records` | `records:write` | 按记录 ID 数组删除记录 |
| `create_field` | `schema:write` | 允许 Agent 在运行中按需为数据表动态新增字段（如新增 `AI摘要` 或 `置信度` 列） |

### 3.2 Claude Desktop / Cursor / OpenClaw 客户端配置示例

```json
{
  "mcpServers": {
    "flaretable": {
      "type": "streamable-http",
      "url": "https://your-flaretable.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ft_live_你的密钥"
      }
    }
  }
}
```
