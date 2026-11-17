import { z } from 'zod';

/**
 * 结构化筛选操作符
 */
export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
  'in',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const FilterOperatorSchema = z.enum(FILTER_OPERATORS);

/**
 * 筛选操作符中文标签，供可视化筛选器使用
 */
export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: '等于',
  neq: '不等于',
  contains: '包含',
  not_contains: '不包含',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  is_empty: '为空',
  is_not_empty: '不为空',
  in: '属于集合',
};

/**
 * 单条筛选条件
 * @description `field` 既可以是 `fld_xxx` 也可以是中文字段名
 */
export const FilterConditionSchema = z.object({
  field: z.string().min(1),
  operator: FilterOperatorSchema,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number()])),
      z.null(),
    ])
    .optional(),
});

export type FilterCondition = z.infer<typeof FilterConditionSchema>;

/**
 * 组合筛选条件组
 */
export const FilterGroupSchema = z.object({
  conjunction: z.enum(['and', 'or']).default('and'),
  conditions: z.array(FilterConditionSchema).default([]),
});

export type FilterGroup = z.infer<typeof FilterGroupSchema>;

/**
 * 排序规则
 */
export const SortSpecSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export type SortSpec = z.infer<typeof SortSpecSchema>;
