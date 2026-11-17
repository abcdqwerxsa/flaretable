import { z } from 'zod';

/**
 * 支持的多维表格字段类型（共 13 种强类型）
 */
export const FIELD_TYPES = [
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
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FieldTypeSchema = z.enum(FIELD_TYPES);

/**
 * 字段类型的中文名称与说明元数据，供 UI 与 MCP 工具描述复用
 */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '多行/单行文本',
  number: '数字',
  single_select: '单选标签',
  multi_select: '多选标签',
  date: '日期时间',
  checkbox: '复选框',
  url: '超链接',
  email: '电子邮箱',
  json: 'JSON 对象',
  attachment: '附件文件',
  link: '关联记录',
  lookup: '查找引用',
  formula: '公式计算',
};

/**
 * 计算型字段类型集合（只读，不可由外部直接赋值）
 */
export const COMPUTED_FIELD_TYPES = new Set<FieldType>(['lookup', 'formula']);

/**
 * 选项标签标准语义色板
 */
export const CHOICE_COLORS = [
  'slate',
  'blue',
  'indigo',
  'emerald',
  'amber',
  'rose',
  'purple',
  'cyan',
] as const;

export type ChoiceColor = (typeof CHOICE_COLORS)[number];

export const SelectChoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.enum(CHOICE_COLORS).default('slate'),
});

export type SelectChoice = z.infer<typeof SelectChoiceSchema>;

/**
 * 附件单元格存储的单个文件结构
 */
export const AttachmentItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().min(1),
});

export type AttachmentItem = z.infer<typeof AttachmentItemSchema>;

/**
 * 字段扩展配置 Schema
 * @description 不同字段类型使用各自对应的配置子集
 */
export const FieldOptionsSchema = z
  .object({
    /** 单选/多选可用选项列表 */
    choices: z.array(SelectChoiceSchema).optional(),
    /** 数字小数保留精度（默认 0~4） */
    precision: z.number().int().min(0).max(8).optional(),
    /** 数字展示格式 */
    numberFormat: z.enum(['decimal', 'percent', 'currency_cny', 'currency_usd']).optional(),
    /** 日期是否包含时分秒 */
    includeTime: z.boolean().optional(),
    /** 关联目标数据表 ID */
    targetTableId: z.string().optional(),
    /** 是否允许关联多条记录（默认 true） */
    allowMultiple: z.boolean().optional(),
    /** 自动维护的对称反向关联字段 ID */
    symmetricFieldId: z.string().optional(),
    /** Lookup 引用的本表关联字段 ID */
    linkFieldId: z.string().optional(),
    /** Lookup 要提取的目标表字段 ID */
    targetFieldId: z.string().optional(),
    /** 公式表达式，如 `{阅读量} * 0.15` 或 `IF({状态} = "已发布", "完成", "进行中")` */
    expression: z.string().optional(),
    /** 公式结果建议展示类型 */
    resultType: z.enum(['text', 'number', 'boolean']).optional(),
  })
  .default({});

export type FieldOptions = z.infer<typeof FieldOptionsSchema>;

/**
 * 字段完整元数据定义
 */
export const FieldMetaSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  name: z.string().min(1).max(120),
  type: FieldTypeSchema,
  options: FieldOptionsSchema,
  isPrimary: z.boolean(),
  isComputed: z.boolean(),
  rank: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FieldMeta = z.infer<typeof FieldMetaSchema>;
