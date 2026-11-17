import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateRecordsRequestSchema,
  DeleteRecordsRequestSchema,
  QueryRecordsRequestSchema,
  RecordItemSchema,
  UpdateRecordsRequestSchema,
  UpsertRecordsRequestSchema,
  type RecordItem,
} from '@flaretable/shared';
import { requireScope } from '../middleware/auth.js';
import { callBaseEngine } from '../durable-objects/do-client.js';
import type { UpsertResult } from '../base-engine/base-service.js';
import type { AppOpenAPI } from './bases.js';

export function registerRecordRoutes(app: AppOpenAPI): void {
  // 1. GET 查询记录（便捷列表/搜索）
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records',
      tags: ['记录操作 (Records)'],
      summary: '分页获取记录列表',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:read')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        query: z.object({
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional().default(100),
          offset: z.coerce.number().int().min(0).optional().default(0),
        }),
      },
      responses: {
        200: {
          description: '记录分页结果',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({
                  total: z.number().int(),
                  records: z.array(RecordItemSchema),
                }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const q = c.req.valid('query');
      const result = await callBaseEngine<{ total: number; records: RecordItem[] }>(c.env, {
        op: 'queryRecords',
        baseId,
        tableId,
        options: { search: q.search, limit: q.limit, offset: q.offset },
      });
      return c.json({ ok: true as const, data: result }, 200);
    },
  );

  // 2. POST 结构化筛选与排序查询
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records/query',
      tags: ['记录操作 (Records)'],
      summary: '结构化条件筛选、排序与搜索记录',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:read')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: QueryRecordsRequestSchema } } },
      },
      responses: {
        200: {
          description: '筛选结果集',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({
                  total: z.number().int(),
                  records: z.array(RecordItemSchema),
                }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const result = await callBaseEngine<{ total: number; records: RecordItem[] }>(c.env, {
        op: 'queryRecords',
        baseId,
        tableId,
        options: body,
      });
      return c.json({ ok: true as const, data: result }, 200);
    },
  );

  // 3. 批量创建记录
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records',
      tags: ['记录操作 (Records)'],
      summary: '批量创建行记录（支持 fieldKeyType=name|id）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: CreateRecordsRequestSchema } } },
      },
      responses: {
        201: {
          description: '新创建并已水合公式/Lookup 的记录列表',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({ records: z.array(RecordItemSchema) }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const records = await callBaseEngine<RecordItem[]>(c.env, {
        op: 'createRecords',
        baseId,
        tableId,
        records: body.records,
        fieldKeyType: body.fieldKeyType ?? 'name',
        actor: principal.actor,
      });
      return c.json({ ok: true as const, data: { records } }, 201);
    },
  );

  // 4. 批量幂等 Upsert（n8n 核心接入接口）
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records/upsert',
      tags: ['记录操作 (Records)'],
      summary: '基于唯一键批量幂等插入或更新（n8n 同步首选）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: UpsertRecordsRequestSchema } } },
      },
      responses: {
        200: {
          description: '幂等 Upsert 汇总结果',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({
                  createdCount: z.number().int(),
                  updatedCount: z.number().int(),
                  records: z.array(
                    z.object({
                      action: z.enum(['created', 'updated']),
                      record: RecordItemSchema,
                    }),
                  ),
                }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const res = await callBaseEngine<UpsertResult>(c.env, {
        op: 'upsertRecords',
        baseId,
        tableId,
        matchField: body.matchField,
        records: body.records,
        fieldKeyType: body.fieldKeyType ?? 'name',
        actor: principal.actor,
      });
      return c.json({ ok: true as const, data: res }, 200);
    },
  );

  // 5. 批量更新记录
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records',
      tags: ['记录操作 (Records)'],
      summary: '批量更新指定记录字段（支持可选乐观锁版本校验）',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: UpdateRecordsRequestSchema } } },
      },
      responses: {
        200: {
          description: '更新后的记录列表',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({ records: z.array(RecordItemSchema) }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const records = await callBaseEngine<RecordItem[]>(c.env, {
        op: 'updateRecords',
        baseId,
        tableId,
        records: body.records,
        fieldKeyType: body.fieldKeyType ?? 'name',
        actor: principal.actor,
      });
      return c.json({ ok: true as const, data: { records } }, 200);
    },
  );

  // 6. 批量删除记录
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/v1/bases/{baseId}/tables/{tableId}/records',
      tags: ['记录操作 (Records)'],
      summary: '批量删除行记录',
      security: [{ bearerAuth: [] }],
      middleware: [requireScope('records:write')] as const,
      request: {
        params: z.object({ baseId: z.string(), tableId: z.string() }),
        body: { content: { 'application/json': { schema: DeleteRecordsRequestSchema } } },
      },
      responses: {
        200: {
          description: '实际删除的记录 ID 列表',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({ deletedIds: z.array(z.string()) }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { baseId, tableId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const res = await callBaseEngine<{ deletedIds: string[] }>(c.env, {
        op: 'deleteRecords',
        baseId,
        tableId,
        recordIds: body.recordIds,
        actor: principal.actor,
      });
      return c.json({ ok: true as const, data: res }, 200);
    },
  );
}
