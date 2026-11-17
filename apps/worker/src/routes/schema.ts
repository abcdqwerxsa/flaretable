import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateFieldRequestSchema,
  CreateTableRequestSchema,
  CreateViewRequestSchema,
  FieldMetaSchema,
  TableMetaSchema,
  TableWithSchemaSchema,
  UpdateFieldRequestSchema,
  UpdateTableRequestSchema,
  UpdateViewRequestSchema,
  ViewMetaSchema,
  type FieldMeta,
  type TableMeta,
  type TableWithSchema,
  type ViewMeta,
} from '@flaretable/shared';
import { requireScope } from '../middleware/auth.js';
import {
  deletePublicFormByView,
  getBaseSummaryOrThrow,
  updateBaseTableCount,
  upsertPublicFormRoute,
} from '../control-plane/workspace-service.js';
import { callBaseEngine } from '../durable-objects/do-client.js';
import type { AppOpenAPI } from './bases.js';

export function registerSchemaRoutes(app: AppOpenAPI): void {
  // 创建数据表
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables',
      tags: ['表与字段 (Schema)'],
      summary: '在空间内新建数据表',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string() }),
        body: { content: { 'application/json': { schema: CreateTableRequestSchema } } },
      },
      responses: {
        201: {
          description: '新创建的数据表结构',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: TableWithSchemaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId } = c.req.valid('param');
      const body = c.req.valid('json');
      await getBaseSummaryOrThrow(c.env.CONTROL_DB, baseId);
      const table = await callBaseEngine<TableWithSchema>(c.env, {
        op: 'createTable',
        baseId,
        input: body,
      });
      const allTables = await callBaseEngine<TableWithSchema[]>(c.env, { op: 'getSchema', baseId });
      await updateBaseTableCount(c.env.CONTROL_DB, baseId, allTables.length);
      return c.json({ ok: true as const, data: table }, 201);
    },
  );

  // 重命名/更新数据表
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/bases/{baseId}/tables/{tableId}',
      tags: ['表与字段 (Schema)'],
      summary: '重命名数据表或修改简介',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: UpdateTableRequestSchema } } },
      },
      responses: {
        200: {
          description: '更新后的数据表元数据',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: TableMetaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const updated = await callBaseEngine<TableMeta>(c.env, {
        op: 'updateTable',
        baseId,
        tableId,
        input: body,
      });
      return c.json({ ok: true as const, data: updated }, 200);
    },
  );

  // 删除数据表
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/v1/bases/{baseId}/tables/{tableId}',
      tags: ['表与字段 (Schema)'],
      summary: '删除数据表',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
      },
      responses: {
        200: {
          description: '删除完成',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.object({ deleted: z.boolean() }) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      await callBaseEngine(c.env, { op: 'deleteTable', baseId, tableId });
      const allTables = await callBaseEngine<TableWithSchema[]>(c.env, { op: 'getSchema', baseId });
      await updateBaseTableCount(c.env.CONTROL_DB, baseId, allTables.length);
      return c.json({ ok: true as const, data: { deleted: true } }, 200);
    },
  );

  // 创建字段
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/fields',
      tags: ['表与字段 (Schema)'],
      summary: '新增数据表字段',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: CreateFieldRequestSchema } } },
      },
      responses: {
        201: {
          description: '新增的字段元数据',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: FieldMetaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const field = await callBaseEngine<FieldMeta>(c.env, {
        op: 'createField',
        baseId,
        tableId,
        input: body,
        actor: principal.actor,
      });
      return c.json({ ok: true as const, data: field }, 201);
    },
  );

  // 更新字段
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/fields/{fieldId}',
      tags: ['表与字段 (Schema)'],
      summary: '更新字段名称或配置',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string(), fieldId: z.string() }),
        body: { content: { 'application/json': { schema: UpdateFieldRequestSchema } } },
      },
      responses: {
        200: {
          description: '更新后的字段元数据',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: FieldMetaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId, fieldId } = c.req.valid('param');
      const body = c.req.valid('json');
      const field = await callBaseEngine<FieldMeta>(c.env, {
        op: 'updateField',
        baseId,
        tableId,
        fieldId,
        input: body,
      });
      return c.json({ ok: true as const, data: field }, 200);
    },
  );

  // 删除字段
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/fields/{fieldId}',
      tags: ['表与字段 (Schema)'],
      summary: '删除字段（主展示字段不可删）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string(), fieldId: z.string() }),
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.object({ deleted: z.boolean() }) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId, fieldId } = c.req.valid('param');
      await callBaseEngine(c.env, { op: 'deleteField', baseId, tableId, fieldId });
      return c.json({ ok: true as const, data: { deleted: true } }, 200);
    },
  );

  // 创建视图
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/views',
      tags: ['视图管理 (Views)'],
      summary: '新增视图（表格/看板/画廊/表单）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: CreateViewRequestSchema } } },
      },
      responses: {
        201: {
          description: '创建的视图元数据',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: ViewMetaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const view = await callBaseEngine<ViewMeta>(c.env, {
        op: 'createView',
        baseId,
        tableId,
        input: body,
      });
      return c.json({ ok: true as const, data: view }, 201);
    },
  );

  // 更新视图配置（同步维护公开表单 D1 路由映射）
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/views/{viewId}',
      tags: ['视图管理 (Views)'],
      summary: '更新视图名称、筛选排序或公开表单开关',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string(), viewId: z.string() }),
        body: { content: { 'application/json': { schema: UpdateViewRequestSchema } } },
      },
      responses: {
        200: {
          description: '更新后的视图元数据',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: ViewMetaSchema }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId, viewId } = c.req.valid('param');
      const body = c.req.valid('json');
      let nextConfig = body.config;

      if (nextConfig && ('publicEnabled' in nextConfig || nextConfig.publicShareToken)) {
        const routeInfo = await upsertPublicFormRoute(c.env.CONTROL_DB, {
          baseId,
          tableId,
          viewId,
          enabled: Boolean(nextConfig.publicEnabled),
          title: nextConfig.formTitle ?? body.name ?? '数据收集表单',
          description: nextConfig.formDescription ?? '',
        });
        nextConfig = {
          ...nextConfig,
          publicShareToken: routeInfo.shareToken,
          publicEnabled: routeInfo.enabled,
        };
      }

      const view = await callBaseEngine<ViewMeta>(c.env, {
        op: 'updateView',
        baseId,
        tableId,
        viewId,
        input: { name: body.name, config: nextConfig },
      });
      return c.json({ ok: true as const, data: view }, 200);
    },
  );

  // 删除视图
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/views/{viewId}',
      tags: ['视图管理 (Views)'],
      summary: '删除视图（至少保留一个视图）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('schema:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string(), viewId: z.string() }),
      },
      responses: {
        200: {
          description: '删除完成',
          content: {
            'application/json': {
              schema: z.object({ ok: z.literal(true), data: z.object({ deleted: z.boolean() }) }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId, viewId } = c.req.valid('param');
      await callBaseEngine(c.env, { op: 'deleteView', baseId, tableId, viewId });
      await deletePublicFormByView(c.env.CONTROL_DB, baseId, viewId);
      return c.json({ ok: true as const, data: { deleted: true } }, 200);
    },
  );
}
