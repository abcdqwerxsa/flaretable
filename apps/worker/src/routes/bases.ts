import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  BaseDetailSchema,
  BaseSummarySchema,
  CreateBaseRequestSchema,
  UpdateBaseRequestSchema,
  generateId,
  type TableWithSchema,
} from '@flaretable/shared';
import type { Env } from '../env.js';
import { requireScope, type AppVariables } from '../middleware/auth.js';
import {
  deleteBaseRecord,
  getBaseSummaryOrThrow,
  insertBaseRecord,
  listBases,
  updateBaseRecord,
} from '../control-plane/workspace-service.js';
import { callBaseEngine } from '../durable-objects/do-client.js';

export type AppOpenAPI = OpenAPIHono<{ Bindings: Env; Variables: AppVariables }>;

export function registerBaseRoutes(app: AppOpenAPI): void {
  // 1. 列出全部空间
  const listBasesRoute = createRoute({
    method: 'get',
    path: '/api/v1/bases',
    tags: ['工作空间 (Bases)'],
    summary: '列出全部多维表格空间',
    security: [{ bearerAuth: [] }],
    middleware: [requireScope('base:read', false)] as const,
    responses: {
      200: {
        description: '空间摘要列表',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), data: z.array(BaseSummarySchema) }),
          },
        },
      },
    },
  });

  app.openapi(listBasesRoute, async (c) => {
    const principal = c.get('principal');
    let bases = await listBases(c.env.CONTROL_DB);
    if (principal.mode === 'api_token' && principal.token && principal.token.baseIds.length > 0) {
      const allowed = new Set(principal.token.baseIds);
      bases = bases.filter((b) => allowed.has(b.id));
    }
    return c.json({ ok: true as const, data: bases }, 200);
  });

  // 2. 创建新空间（默认初始化空白多维表格）
  const createBaseRoute = createRoute({
    method: 'post',
    path: '/api/v1/bases',
    tags: ['工作空间 (Bases)'],
    summary: '创建多维表格空间（默认生成空白数据表 1）',
    security: [{ bearerAuth: [] }],
    middleware: [requireScope('schema:write', false)] as const,
    request: {
      body: {
        content: {
          'application/json': { schema: CreateBaseRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: '创建成功的完整空间与 Schema',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), data: BaseDetailSchema }),
          },
        },
      },
    },
  });

  app.openapi(createBaseRoute, async (c) => {
    const body = c.req.valid('json');
    const baseId = generateId('base');

    const initRes = await callBaseEngine<{ tableCount: number; tables: TableWithSchema[] }>(c.env, {
      op: 'initBlankBase',
      baseId,
    });

    const summary = await insertBaseRecord(c.env.CONTROL_DB, {
      id: baseId,
      name: body.name,
      description: body.description,
      icon: body.icon,
      templateKey: 'blank',
      tableCount: initRes.tableCount,
    });

    return c.json(
      {
        ok: true as const,
        data: { ...summary, tables: initRes.tables },
      },
      201,
    );
  });

  // 2.5 更新空间名称或简介
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/bases/{baseId}',
      tags: ['工作空间 (Bases)'],
      summary: '重命名或更新空间简介',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string() }),
        body: { content: { 'application/json': { schema: UpdateBaseRequestSchema } } },
      },
      responses: {
        200: {
          description: '更新后的空间摘要',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: BaseSummarySchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId } = c.req.valid('param');
      const body = c.req.valid('json');
      const updated = await updateBaseRecord(c.env.CONTROL_DB, baseId, body);
      return c.json({ ok: true as const, data: updated }, 200);
    },
  );

  // 3. 获取单空间完整 Schema（表、字段、视图）
  const getBaseDetailRoute = createRoute({
    method: 'get',
    path: '/api/v1/bases/{baseId}',
    tags: ['工作空间 (Bases)'],
    summary: '获取空间完整表结构 (Schema)',
    security: [{ bearerAuth: [] }],
    middleware: [requireScope('base:read')] as const,
    request: {
      params: z.object({ baseId: z.string() }),
    },
    responses: {
      200: {
        description: '空间详情及全部数据表结构',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), data: BaseDetailSchema }),
          },
        },
      },
    },
  });

  app.openapi(getBaseDetailRoute, async (c) => {
    const { baseId } = c.req.valid('param');
    const summary = await getBaseSummaryOrThrow(c.env.CONTROL_DB, baseId);
    const tables = await callBaseEngine<TableWithSchema[]>(c.env, { op: 'getSchema', baseId });
    return c.json({ ok: true as const, data: { ...summary, tables } }, 200);
  });

  // 4. 删除空间
  const deleteBaseRoute = createRoute({
    method: 'delete',
    path: '/api/v1/bases/{baseId}',
    tags: ['工作空间 (Bases)'],
    summary: '删除多维表格空间',
    security: [{ bearerAuth: [] }],
    middleware: [requireScope('schema:write')] as const,
    request: {
      params: z.object({ baseId: z.string() }),
    },
    responses: {
      200: {
        description: '已删除空间',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), data: z.object({ deleted: z.boolean() }) }),
          },
        },
      },
    },
  });

  app.openapi(deleteBaseRoute, async (c) => {
    const { baseId } = c.req.valid('param');
    await getBaseSummaryOrThrow(c.env.CONTROL_DB, baseId);
    await deleteBaseRecord(c.env.CONTROL_DB, baseId);
    return c.json({ ok: true as const, data: { deleted: true } }, 200);
  });
}
