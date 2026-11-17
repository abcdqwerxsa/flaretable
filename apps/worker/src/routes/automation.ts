import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateTokenRequestSchema,
  CreateWebhookRequestSchema,
  generateId,
  type AutomationEvent,
} from '@flaretable/shared';
import { requireScope } from '../middleware/auth.js';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '../control-plane/token-service.js';
import {
  createWebhook,
  deleteWebhook,
  deliverSingleWebhook,
  listWebhookDeliveries,
  listWebhooks,
  toggleWebhook,
} from '../control-plane/webhook-service.js';
import { AppError } from '../utils/response.js';
import type { AppOpenAPI } from './bases.js';

export function registerAutomationRoutes(app: AppOpenAPI): void {
  // ==================== API Tokens ====================

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/tokens',
      tags: ['自动化与密钥 (Automation)'],
      summary: '查看已签发的 API Token 列表（密钥已脱敏）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('webhooks:manage', false)] as const,
      responses: {
        200: {
          description: 'Token 列表',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.array(z.any()) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const tokens = await listApiTokens(c.env.CONTROL_DB);
      return c.json({ ok: true as const, data: tokens }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/tokens',
      tags: ['自动化与密钥 (Automation)'],
      summary: '签发新的细粒度 API Token（仅在创建时返回一次明文）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('webhooks:manage', false)] as const,
      request: {
        body: { content: { 'application/json': { schema: CreateTokenRequestSchema } } },
      },
      responses: {
        201: {
          description: '签发成功的 Token 及一次性明文',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({ token: z.any(), plainTextToken: z.string() }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const created = await createApiToken(c.env, body);
      return c.json({ ok: true as const, data: created }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/v1/tokens/{tokenId}',
      tags: ['自动化与密钥 (Automation)'],
      summary: '立即吊销 API Token 并驱逐 KV 缓存',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('webhooks:manage', false)] as const,
      request: {
        params: z.object({ tokenId: z.string() }),
      },
      responses: {
        200: {
          description: '吊销成功',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.object({ revoked: z.boolean() }) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { tokenId } = c.req.valid('param');
      await revokeApiToken(c.env, tokenId);
      return c.json({ ok: true as const, data: { revoked: true } }, 200);
    },
  );

  // ==================== Webhooks ====================

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/webhooks',
      tags: ['自动化与密钥 (Automation)'],
      summary: '列出 Webhook 订阅配置',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('webhooks:manage', false)] as const,
      request: {
        query: z.object({ baseId: z.string().optional() }),
      },
      responses: {
        200: {
          description: 'Webhook 订阅列表',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.array(z.any()) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId } = c.req.valid('query');
      const list = await listWebhooks(c.env.CONTROL_DB, baseId);
      return c.json({ ok: true as const, data: list }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/webhooks',
      tags: ['自动化与密钥 (Automation)'],
      summary: '创建支持 HMAC-SHA256 签名的 Webhook 订阅',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('webhooks:manage', false)] as const,
      request: {
        body: { content: { 'application/json': { schema: CreateWebhookRequestSchema } } },
      },
      responses: {
        201: {
          description: '创建的 Webhook 配置',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.any() }),
            },
          },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const wh = await createWebhook(c.env.CONTROL_DB, body);
      return c.json({ ok: true as const, data: wh }, 201);
    },
  );

  app.patch('/api/v1/webhooks/:webhookId', requireScope('webhooks:manage', false), async (c) => {
    const webhookId = c.req.param('webhookId') ?? '';
    const body = (await c.req.json()) as { enabled?: boolean };
    const updated = await toggleWebhook(c.env.CONTROL_DB, webhookId, Boolean(body.enabled));
    return c.json({ ok: true, data: updated });
  });

  app.delete('/api/v1/webhooks/:webhookId', requireScope('webhooks:manage', false), async (c) => {
    const webhookId = c.req.param('webhookId') ?? '';
    await deleteWebhook(c.env.CONTROL_DB, webhookId);
    return c.json({ ok: true, data: { deleted: true } });
  });

  app.post('/api/v1/webhooks/:webhookId/test', requireScope('webhooks:manage', false), async (c) => {
    const webhookId = c.req.param('webhookId') ?? '';
    const list = await listWebhooks(c.env.CONTROL_DB);
    const wh = list.find((item) => item.id === webhookId);
    if (!wh) {
      throw new AppError(404, 'WEBHOOK_NOT_FOUND', `未找到 Webhook「${webhookId}」`);
    }

    const testEvent: AutomationEvent = {
      eventId: generateId('evt'),
      eventType: 'webhook.test',
      timestamp: new Date().toISOString(),
      baseId: wh.baseId,
      tableId: 'tbl_test',
      actor: c.get('principal').actor,
      data: {
        message: '来自 FlareTable（飞格多维表格）的测试事件，用于校验 n8n 连通性与 HMAC 签名。',
      },
    };

    const log = await deliverSingleWebhook(c.env.CONTROL_DB, wh, testEvent, 1);
    return c.json({ ok: true, data: log });
  });

  app.get('/api/v1/webhooks/:webhookId/deliveries', requireScope('webhooks:manage', false), async (c) => {
    const webhookId = c.req.param('webhookId') ?? '';
    const logs = await listWebhookDeliveries(c.env.CONTROL_DB, webhookId, 20);
    return c.json({ ok: true, data: logs });
  });
}
