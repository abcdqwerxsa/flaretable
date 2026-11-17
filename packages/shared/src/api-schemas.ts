import { z } from 'zod';
import { FieldMetaSchema, FieldOptionsSchema, FieldTypeSchema } from './fields.js';
import { FilterGroupSchema, SortSpecSchema } from './filters.js';
import { ViewConfigSchema, ViewMetaSchema, ViewTypeSchema } from './views.js';
import { AutomationEventTypeSchema } from './events.js';

/**
 * API Token 支持的细粒度权限范围
 */
export const API_SCOPES = [
  'base:read',
  'records:read',
  'records:write',
  'schema:write',
  'webhooks:manage',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const ApiScopeSchema = z.enum(API_SCOPES);

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  'base:read': '读取空间与表结构 (Schema)',
  'records:read': '查询与读取行记录',
  'records:write': '新增、更新、Upsert 与删除记录',
  'schema:write': '创建与修改表、字段及视图',
  'webhooks:manage': '管理自动化 Webhook 与查看投递日志',
};

/**
 * 空间摘要信息
 */
export const BaseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  templateKey: z.string(),
  tableCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BaseSummary = z.infer<typeof BaseSummarySchema>;

/**
 * 数据表元数据
 */
export const TableMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  primaryFieldId: z.string(),
  rank: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TableMeta = z.infer<typeof TableMetaSchema>;

/**
 * 完整表结构（含字段与视图）
 */
export const TableWithSchemaSchema = TableMetaSchema.extend({
  fields: z.array(FieldMetaSchema),
  views: z.array(ViewMetaSchema),
});

export type TableWithSchema = z.infer<typeof TableWithSchemaSchema>;

/**
 * 完整空间 Schema（含全部表、字段与视图）
 */
export const BaseDetailSchema = BaseSummarySchema.extend({
  tables: z.array(TableWithSchemaSchema),
});

export type BaseDetail = z.infer<typeof BaseDetailSchema>;

/**
 * 单元格值宽松校验类型
 */
export const CellValueSchema = z.unknown();

/**
 * 标准化记录响应结构
 * @description 同时提供稳定 `fields` (按 fld_xxx 键) 与人类可读 `fieldsByName` (按当前列名键)
 */
export const RecordItemSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  rank: z.string(),
  version: z.number().int(),
  fields: z.record(z.string(), CellValueSchema),
  fieldsByName: z.record(z.string(), CellValueSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RecordItem = z.infer<typeof RecordItemSchema>;

/**
 * 创建空间请求（默认初始化空白多维表格）
 */
export const CreateBaseRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional().default(''),
  icon: z.string().max(16).optional().default('table'),
});

/**
 * 更新空间信息请求
 */
export const UpdateBaseRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).optional(),
});

/**
 * 创建数据表请求
 */
export const CreateTableRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional().default(''),
  primaryFieldName: z.string().min(1).max(80).optional().default('文本'),
  includeStarterFields: z.boolean().optional().default(false),
});

/**
 * 更新数据表信息请求
 */
export const UpdateTableRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
});

/**
 * 创建字段请求
 */
export const CreateFieldRequestSchema = z.object({
  name: z.string().min(1).max(120),
  type: FieldTypeSchema,
  options: FieldOptionsSchema.optional(),
});

/**
 * 更新字段请求
 */
export const UpdateFieldRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  options: FieldOptionsSchema.optional(),
});

/**
 * 创建视图请求
 */
export const CreateViewRequestSchema = z.object({
  name: z.string().min(1).max(80),
  type: ViewTypeSchema,
  config: ViewConfigSchema.optional(),
});

/**
 * 更新视图请求
 */
export const UpdateViewRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  config: ViewConfigSchema.optional(),
});

/**
 * 字段键模式：`name` 按中文/英文字段名匹配，`id` 按不可变 `fld_xxx` 匹配
 */
export const FieldKeyTypeSchema = z.enum(['name', 'id']).default('id');
export type FieldKeyType = z.infer<typeof FieldKeyTypeSchema>;

/**
 * 高级记录查询请求体
 */
export const QueryRecordsRequestSchema = z.object({
  fieldKeyType: FieldKeyTypeSchema.optional().default('id'),
  filter: FilterGroupSchema.optional(),
  sorts: z.array(SortSpecSchema).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * 批量创建记录请求
 */
export const CreateRecordsRequestSchema = z.object({
  fieldKeyType: FieldKeyTypeSchema.optional().default('name'),
  records: z
    .array(
      z.object({
        fields: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * 批量更新记录请求
 */
export const UpdateRecordsRequestSchema = z.object({
  fieldKeyType: FieldKeyTypeSchema.optional().default('name'),
  records: z
    .array(
      z.object({
        id: z.string().min(1),
        expectedVersion: z.number().int().optional(),
        fields: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * 批量幂等 Upsert 记录请求（n8n / 外部数据同步核心能力）
 */
export const UpsertRecordsRequestSchema = z.object({
  fieldKeyType: FieldKeyTypeSchema.optional().default('name'),
  matchField: z.string().min(1),
  records: z
    .array(
      z.object({
        fields: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * 批量删除记录请求
 */
export const DeleteRecordsRequestSchema = z.object({
  recordIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * 创建 API Token 请求
 */
export const CreateTokenRequestSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(ApiScopeSchema).min(1),
  baseIds: z.array(z.string()).optional().default([]),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

/**
 * 创建 Webhook 订阅请求
 */
export const CreateWebhookRequestSchema = z.object({
  baseId: z.string().min(1),
  name: z.string().min(1).max(80),
  targetUrl: z.string().url(),
  events: z.array(AutomationEventTypeSchema).min(1),
});

/**
 * R2 存储配额状态响应
 */
export const StorageQuotaSchema = z.object({
  usedBytes: z.number().int().nonnegative(),
  maxTotalBytes: z.number().int().positive(),
  maxFileBytes: z.number().int().positive(),
  objectCount: z.number().int().nonnegative(),
  usageRatio: z.number(),
});

export type StorageQuota = z.infer<typeof StorageQuotaSchema>;
