import { z } from 'zod';
import { FilterGroupSchema, SortSpecSchema } from './filters.js';

/**
 * 支持的多维视图类型
 */
export const VIEW_TYPES = ['grid', 'kanban', 'gallery', 'form'] as const;

export type ViewType = (typeof VIEW_TYPES)[number];

export const ViewTypeSchema = z.enum(VIEW_TYPES);

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  grid: '表格视图',
  kanban: '看板视图',
  gallery: '画廊视图',
  form: '表单视图',
};

export const FORM_THEMES = ['blue', 'indigo', 'emerald', 'amber', 'rose', 'slate'] as const;
export type FormTheme = (typeof FORM_THEMES)[number];

/**
 * 视图配置对象 Schema
 */
export const ViewConfigSchema = z
  .object({
    /** 视图级别默认筛选条件 */
    filter: FilterGroupSchema.optional(),
    /** 视图级别排序规则 */
    sorts: z.array(SortSpecSchema).optional(),
    /** 隐藏不展示的字段 ID 列表 */
    hiddenFieldIds: z.array(z.string()).optional(),
    /** 列宽映射（fld_xxx -> 像素宽度） */
    columnWidths: z.record(z.string(), z.number()).optional(),
    /** 看板视图分组依赖的单选字段 ID */
    groupByFieldId: z.string().optional(),
    /** 画廊视图封面图关联的附件字段 ID */
    coverFieldId: z.string().optional(),
    /** 表单视图标题 */
    formTitle: z.string().max(120).optional(),
    /** 表单视图说明描述 */
    formDescription: z.string().max(600).optional(),
    /** 表单主题配色 */
    formTheme: z.enum(FORM_THEMES).optional(),
    /** 自定义提交按钮文案 */
    formSubmitText: z.string().max(40).optional(),
    /** 自定义提交成功提示语 */
    formSuccessMessage: z.string().max(300).optional(),
    /** 提交成功后是否允许再次填写 */
    formAllowResubmit: z.boolean().optional(),
    /** 表单视图展示提交的字段顺序 */
    formFieldIds: z.array(z.string()).optional(),
    /** 表单必填字段 ID 列表 */
    formRequiredFieldIds: z.array(z.string()).optional(),
    /** 表单字段填写提示语（fld_xxx -> 提示文本） */
    formFieldHints: z.record(z.string(), z.string()).optional(),
    /** 公开表单访问 Token（存在即表示可通过 /f/:shareToken 访问） */
    publicShareToken: z.string().optional(),
    /** 是否开启公开外部填写 */
    publicEnabled: z.boolean().optional(),
  })
  .default({});

export type ViewConfig = z.infer<typeof ViewConfigSchema>;

/**
 * 视图完整元数据
 */
export const ViewMetaSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  name: z.string().min(1).max(80),
  type: ViewTypeSchema,
  config: ViewConfigSchema,
  rank: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ViewMeta = z.infer<typeof ViewMetaSchema>;
