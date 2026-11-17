import {
  CreateFieldRequestSchema,
  CreateRecordsRequestSchema,
  DeleteRecordsRequestSchema,
  QueryRecordsRequestSchema,
  UpsertRecordsRequestSchema,
  type ApiScope,
  type BaseSummary,
  type FieldMeta,
  type RecordItem,
  type TableWithSchema,
} from '@flaretable/shared';
import { z } from 'zod';
import type { Env } from '../env.js';
import {
  assertAuthorized,
  authenticateRequest,
  type AuthPrincipal,
} from '../middleware/auth.js';
import { listBases } from '../control-plane/workspace-service.js';
import { callBaseEngine } from '../durable-objects/do-client.js';
import type { UpsertResult } from '../base-engine/base-service.js';
import { AppError } from '../utils/response.js';

/**
 * MCP 工具抽象后端执行适配器（支持在单元测试中注入内存引擎）
 */
export interface McpEngineAdapter {
  listBases(): Promise<BaseSummary[]>;
  getBaseSchema(baseId: string): Promise<TableWithSchema[]>;
  queryRecords(
    baseId: string,
    tableId: string,
    input: z.infer<typeof QueryRecordsRequestSchema>,
  ): Promise<{ total: number; records: RecordItem[] }>;
  createRecords(
    baseId: string,
    tableId: string,
    input: z.infer<typeof CreateRecordsRequestSchema>,
    actor: AuthPrincipal['actor'],
  ): Promise<RecordItem[]>;
  upsertRecords(
    baseId: string,
    tableId: string,
    input: z.infer<typeof UpsertRecordsRequestSchema>,
    actor: AuthPrincipal['actor'],
  ): Promise<UpsertResult>;
  updateRecord(
    baseId: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
    fieldKeyType: 'name' | 'id',
    actor: AuthPrincipal['actor'],
  ): Promise<RecordItem[]>;
  deleteRecords(
    baseId: string,
    tableId: string,
    recordIds: string[],
    actor: AuthPrincipal['actor'],
  ): Promise<{ deletedIds: string[] }>;
  createField(
    baseId: string,
    tableId: string,
    input: z.infer<typeof CreateFieldRequestSchema>,
    actor: AuthPrincipal['actor'],
  ): Promise<FieldMeta>;
}

/**
 * 构建基于真实 Cloudflare D1 + Durable Objects 的 MCP 适配器
 */
export function createCloudflareMcpAdapter(env: Env): McpEngineAdapter {
  return {
    listBases: () => listBases(env.CONTROL_DB),
    getBaseSchema: (baseId) => callBaseEngine(env, { op: 'getSchema', baseId }),
    queryRecords: (baseId, tableId, input) =>
      callBaseEngine(env, { op: 'queryRecords', baseId, tableId, options: input }),
    createRecords: (baseId, tableId, input, actor) =>
      callBaseEngine(env, {
        op: 'createRecords',
        baseId,
        tableId,
        records: input.records,
        fieldKeyType: input.fieldKeyType ?? 'name',
        actor,
      }),
    upsertRecords: (baseId, tableId, input, actor) =>
      callBaseEngine(env, {
        op: 'upsertRecords',
        baseId,
        tableId,
        matchField: input.matchField,
        records: input.records,
        fieldKeyType: input.fieldKeyType ?? 'name',
        actor,
      }),
    updateRecord: (baseId, tableId, recordId, fields, fieldKeyType, actor) =>
      callBaseEngine(env, {
        op: 'updateRecords',
        baseId,
        tableId,
        records: [{ id: recordId, fields }],
        fieldKeyType,
        actor,
      }),
    deleteRecords: (baseId, tableId, recordIds, actor) =>
      callBaseEngine(env, { op: 'deleteRecords', baseId, tableId, recordIds, actor }),
    createField: (baseId, tableId, input, actor) =>
      callBaseEngine(env, { op: 'createField', baseId, tableId, input, actor }),
  };
}

interface McpToolDescriptor {
  name: string;
  description: string;
  requiredScope: ApiScope;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDescriptor[] = [
  {
    name: 'list_bases',
    description: '列出当前所有多维表格空间（Base）的 ID、名称、简介和包含的数据表数量。',
    requiredScope: 'base:read',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_base_schema',
    description: '读取指定空间内的全部数据表、字段定义（含中文名称、字段 ID、类型、单选/多选配置、公式与关联关系）及视图列表。写入或查询前请先调用此工具。',
    requiredScope: 'base:read',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string', description: '空间 ID，如 base_xxx' },
      },
      required: ['baseId'],
    },
  },
  {
    name: 'query_records',
    description: '按表 ID 或表名称检索记录，支持全文搜索、结构化筛选条件组（AND/OR）和排序分页。',
    requiredScope: 'records:read',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string', description: '空间 ID' },
        tableId: { type: 'string', description: '数据表 ID 或中文表名' },
        search: { type: 'string', description: '可选全文检索关键词' },
        fieldKeyType: { type: 'string', enum: ['name', 'id'], default: 'name' },
        filter: {
          type: 'object',
          description: '结构化筛选组 { conjunction: "and"|"or", conditions: [{ field, operator, value }] }',
        },
        sorts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
      required: ['baseId', 'tableId'],
    },
  },
  {
    name: 'create_records',
    description: '向指定数据表批量新增一条或多条记录，默认支持直接使用中文字段名传入数据。',
    requiredScope: 'records:write',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string' },
        tableId: { type: 'string', description: '数据表 ID 或表名' },
        fieldKeyType: { type: 'string', enum: ['name', 'id'], default: 'name' },
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fields: { type: 'object', additionalProperties: true },
            },
            required: ['fields'],
          },
        },
      },
      required: ['baseId', 'tableId', 'records'],
    },
  },
  {
    name: 'upsert_records',
    description: '基于指定唯一业务字段（matchField）批量幂等插入或合并更新记录，避免重复写入脏数据。',
    requiredScope: 'records:write',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string' },
        tableId: { type: 'string' },
        matchField: { type: 'string', description: '用于查重的唯一业务列名或字段 ID' },
        fieldKeyType: { type: 'string', enum: ['name', 'id'], default: 'name' },
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fields: { type: 'object', additionalProperties: true },
            },
            required: ['fields'],
          },
        },
      },
      required: ['baseId', 'tableId', 'matchField', 'records'],
    },
  },
  {
    name: 'update_record',
    description: '局部更新单条记录的指定字段值。',
    requiredScope: 'records:write',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string' },
        tableId: { type: 'string' },
        recordId: { type: 'string', description: '待更新记录 ID，如 rec_xxx' },
        fieldKeyType: { type: 'string', enum: ['name', 'id'], default: 'name' },
        fields: { type: 'object', additionalProperties: true },
      },
      required: ['baseId', 'tableId', 'recordId', 'fields'],
    },
  },
  {
    name: 'delete_records',
    description: '按记录 ID 列表删除数据表中的记录，并自动清理关联边。',
    requiredScope: 'records:write',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string' },
        tableId: { type: 'string' },
        recordIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['baseId', 'tableId', 'recordIds'],
    },
  },
  {
    name: 'create_field',
    description: '为数据表动态新增强类型字段（如 text/number/single_select/json/formula 等），便于智能体自主扩展数据维度。',
    requiredScope: 'schema:write',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: { type: 'string' },
        tableId: { type: 'string' },
        name: { type: 'string', description: '新字段名称' },
        type: {
          type: 'string',
          enum: [
            'text',
            'number',
            'single_select',
            'multi_select',
            'date',
            'checkbox',
            'url',
            'email',
            'json',
            'attachment',
            'link',
            'lookup',
            'formula',
          ],
        },
        options: { type: 'object', additionalProperties: true },
      },
      required: ['baseId', 'tableId', 'name', 'type'],
    },
  },
];

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function jsonRpcResult(id: string | number | null, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status = 200,
): Response {
  return Response.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status },
  );
}

/**
 * 处理符合 MCP Streamable HTTP (JSON-RPC 2.0) 标准的请求
 */
export async function handleMcpHttpRequest(
  request: Request,
  options: {
    authenticate: () => Promise<AuthPrincipal>;
    adapter: McpEngineAdapter;
  },
): Promise<Response> {
  if (request.method === 'GET') {
    return Response.json({
      name: 'flaretable-mcp',
      version: '1.0.0',
      transport: 'streamable-http',
      protocolVersions: ['2025-03-26', '2024-11-05'],
      toolCount: MCP_TOOLS.length,
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, 'JSON 解析失败', 400);
  }

  const reqId = body.id ?? null;

  // JSON-RPC Notification（例如 notifications/initialized）无需返回正文
  if (body.id === undefined && body.method?.startsWith('notifications/')) {
    return new Response(null, { status: 202 });
  }

  switch (body.method) {
    case 'initialize': {
      const clientProto =
        typeof body.params?.protocolVersion === 'string'
          ? body.params.protocolVersion
          : '2025-03-26';
      return jsonRpcResult(reqId, {
        protocolVersion: clientProto,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'flaretable-mcp',
          version: '1.0.0',
        },
        instructions:
          'FlareTable（飞格多维表格）MCP 服务端。建议先调用 list_bases 与 get_base_schema 获取表和字段信息，再执行查询或幂等写入。',
      });
    }

    case 'ping':
      return jsonRpcResult(reqId, {});

    case 'tools/list': {
      // 认证检查，避免未授权探测工具定义
      try {
        await options.authenticate();
      } catch (err) {
        const msg = err instanceof AppError ? err.message : '认证失败';
        return jsonRpcError(reqId, -32001, msg, 401);
      }

      return jsonRpcResult(reqId, {
        tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    }

    case 'tools/call': {
      let principal: AuthPrincipal;
      try {
        principal = await options.authenticate();
      } catch (err) {
        const msg = err instanceof AppError ? err.message : '认证失败';
        return jsonRpcError(reqId, -32001, msg, 401);
      }

      const toolName = String(body.params?.name ?? '');
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
      const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
      if (!toolDef) {
        return jsonRpcError(reqId, -32601, `未找到 MCP 工具「${toolName}」`);
      }

      try {
        const baseId = typeof args.baseId === 'string' ? args.baseId : undefined;
        assertAuthorized(principal, toolDef.requiredScope, baseId);

        const mcpActor: AuthPrincipal['actor'] = {
          type: 'mcp',
          id: principal.token?.id,
          label: principal.token ? `MCP:${principal.token.name}` : 'MCP:管理员',
        };

        const data = await executeMcpTool(toolName, args, options.adapter, mcpActor);
        return jsonRpcResult(reqId, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
          isError: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '工具调用失败';
        return jsonRpcResult(reqId, {
          content: [{ type: 'text', text: `调用失败: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonRpcError(reqId, -32601, `不支持的 MCP 方法：${body.method ?? 'unknown'}`);
  }
}

async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  adapter: McpEngineAdapter,
  actor: AuthPrincipal['actor'],
): Promise<unknown> {
  switch (toolName) {
    case 'list_bases':
      return { bases: await adapter.listBases() };

    case 'get_base_schema': {
      const { baseId } = z.object({ baseId: z.string().min(1) }).parse(args);
      return { baseId, tables: await adapter.getBaseSchema(baseId) };
    }

    case 'query_records': {
      const { baseId, tableId, ...query } = z
        .object({
          baseId: z.string().min(1),
          tableId: z.string().min(1),
        })
        .merge(QueryRecordsRequestSchema)
        .parse({ fieldKeyType: 'name', ...args });
      return adapter.queryRecords(baseId, tableId, query);
    }

    case 'create_records': {
      const { baseId, tableId, ...payload } = z
        .object({ baseId: z.string().min(1), tableId: z.string().min(1) })
        .merge(CreateRecordsRequestSchema)
        .parse({ fieldKeyType: 'name', ...args });
      const created = await adapter.createRecords(baseId, tableId, payload, actor);
      return { createdCount: created.length, records: created };
    }

    case 'upsert_records': {
      const { baseId, tableId, ...payload } = z
        .object({ baseId: z.string().min(1), tableId: z.string().min(1) })
        .merge(UpsertRecordsRequestSchema)
        .parse({ fieldKeyType: 'name', ...args });
      return adapter.upsertRecords(baseId, tableId, payload, actor);
    }

    case 'update_record': {
      const parsed = z
        .object({
          baseId: z.string().min(1),
          tableId: z.string().min(1),
          recordId: z.string().min(1),
          fieldKeyType: z.enum(['name', 'id']).default('name'),
          fields: z.record(z.string(), z.unknown()),
        })
        .parse(args);
      const updated = await adapter.updateRecord(
        parsed.baseId,
        parsed.tableId,
        parsed.recordId,
        parsed.fields,
        parsed.fieldKeyType,
        actor,
      );
      return { record: updated[0] };
    }

    case 'delete_records': {
      const parsed = z
        .object({ baseId: z.string().min(1), tableId: z.string().min(1) })
        .merge(DeleteRecordsRequestSchema)
        .parse(args);
      return adapter.deleteRecords(parsed.baseId, parsed.tableId, parsed.recordIds, actor);
    }

    case 'create_field': {
      const { baseId, tableId, ...fieldInput } = z
        .object({ baseId: z.string().min(1), tableId: z.string().min(1) })
        .merge(CreateFieldRequestSchema)
        .parse(args);
      return adapter.createField(baseId, tableId, fieldInput, actor);
    }

    default:
      throw new AppError(400, 'UNKNOWN_TOOL', `未知工具：${toolName}`);
  }
}

/**
 * Worker 原生请求包装器
 */
export function handleWorkerMcpRequest(request: Request, env: Env): Promise<Response> {
  return handleMcpHttpRequest(request, {
    authenticate: () => authenticateRequest(env, request.headers),
    adapter: createCloudflareMcpAdapter(env),
  });
}
