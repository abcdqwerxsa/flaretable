import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import type { AutomationEvent } from '@flaretable/shared';
import type { Env } from './env.js';
import type { AppVariables } from './middleware/auth.js';
import { errorToJsonResponse } from './utils/response.js';
import { registerBaseRoutes } from './routes/bases.js';
import { registerSchemaRoutes } from './routes/schema.js';
import { registerRecordRoutes } from './routes/records.js';
import { registerPublicFormRoutes } from './routes/forms.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { handleWorkerMcpRequest } from './mcp/server.js';
import { handleAutomationQueueBatch } from './queue/consumer.js';
import { handleScheduledMaintenance } from './queue/cron-gc.js';
import { BaseEngineDO } from './durable-objects/base-engine-do.js';

export { BaseEngineDO };

const app = new OpenAPIHono<{ Bindings: Env; Variables: AppVariables }>();

// 全局 CORS（方便外部 n8n / AI 客户端及本地调试）
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Passcode', 'MCP-Protocol-Version'],
  }),
);

// 统一业务异常处理
app.onError((err, c) => errorToJsonResponse(c, err));

// OpenAPI 安全方案声明
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'ft_live_xxx',
  description: '使用工作台「自动化中心」签发的 API Token，格式：Authorization: Bearer ft_live_...',
});

// 健康检查
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'flaretable',
    environment: c.env.ENVIRONMENT ?? 'development',
    timestamp: new Date().toISOString(),
  }),
);

// 注册全部 REST / OpenAPI 路由
registerBaseRoutes(app);
registerSchemaRoutes(app);
registerRecordRoutes(app);
registerPublicFormRoutes(app);
registerAttachmentRoutes(app);
registerAutomationRoutes(app);

// OpenAPI 3.1 规范导出（n8n / Swagger / LangChain 可直接导入）
app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'FlareTable（飞格多维表格）自动化 API',
    version: '1.0.0',
    description:
      '基于 Cloudflare Workers + Durable Objects SQLite + D1 + Queues + R2 的自动化多维表格接口规范。支持 fieldKeyType=name（中文列名直写）与幂等 Upsert。',
  },
});

// Scalar 交互式 API 文档
app.get(
  '/docs',
  Scalar({
    url: '/openapi.json',
    pageTitle: 'FlareTable API 文档',
  }),
);

// 原生 MCP Server Streamable HTTP 端点
app.all('/mcp', (c) => handleWorkerMcpRequest(c.req.raw, c.env));
app.all('/mcp/*', (c) => handleWorkerMcpRequest(c.req.raw, c.env));

// Hibernatable WebSocket 实时协同接入点
app.get('/ws', async (c) => {
  const baseId = c.req.query('baseId');
  if (!baseId) {
    return c.json({ ok: false, error: { code: 'MISSING_BASE_ID', message: '缺少 baseId 参数' } }, 400);
  }
  const id = c.env.BASE_ENGINE.idFromName(baseId);
  const stub = c.env.BASE_ENGINE.get(id);
  return stub.fetch(c.req.raw);
});

// 静态前端资源与 SPA 路由兜底
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('FlareTable Worker 运行中（前端静态产物尚未构建）', 404);
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<AutomationEvent>, env: Env): Promise<void> {
    await handleAutomationQueueBatch(batch, env);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduledMaintenance(env));
  },
};
