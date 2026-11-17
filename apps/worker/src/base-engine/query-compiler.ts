import {
  COMPUTED_FIELD_TYPES,
  type FieldKeyType,
  type FieldMeta,
  type FilterGroup,
  type SortSpec,
} from '@flaretable/shared';
import type { SqlParam } from './sql-driver.js';
import { resolveField } from './field-validator.js';
import { AppError } from '../utils/response.js';

export interface CompiledQuery {
  whereSql: string;
  orderBySql: string;
  params: SqlParam[];
}

/**
 * 校验并构建安全的 SQLite json_extract 表达式
 */
function safeJsonPathExpr(fieldId: string): string {
  if (!/^fld_[a-z0-9]+$/.test(fieldId)) {
    throw new AppError(400, 'INVALID_FIELD_ID', `非法字段标识：${fieldId}`);
  }
  return `json_extract(data_json, '$.${fieldId}')`;
}

/**
 * 将 JS 原生标量值转换为 SQLite json_extract 可精准比较的参数类型
 */
function toSqlScalar(val: string | number | boolean): SqlParam {
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }
  return val;
}

/**
 * 将结构化 FilterGroup、SortSpec 与全文检索编译为防注入的参数化 SQL
 */
export function compileRecordQuery(options: {
  tableId: string;
  fields: FieldMeta[];
  fieldKeyType: FieldKeyType;
  filter?: FilterGroup;
  sorts?: SortSpec[];
  search?: string;
}): CompiledQuery {
  const params: SqlParam[] = [options.tableId];
  const rootClauses: string[] = ['table_id = ?'];

  // 1. 全文关键词搜索（匹配预构建的小写 search_text）
  const keyword = options.search?.trim().toLowerCase();
  if (keyword) {
    rootClauses.push('search_text LIKE ?');
    params.push(`%${keyword}%`);
  }

  // 2. 结构化 FilterGroup 编译
  if (options.filter && options.filter.conditions.length > 0) {
    const condClauses: string[] = [];

    for (const cond of options.filter.conditions) {
      const field = resolveField(options.fields, cond.field, options.fieldKeyType);
      if (!field) {
        throw new AppError(400, 'UNKNOWN_FIELD', `筛选条件中引用了不存在的字段「${cond.field}」`);
      }
      if (COMPUTED_FIELD_TYPES.has(field.type)) {
        throw new AppError(
          400,
          'UNSUPPORTED_COMPUTED_FILTER',
          `计算字段「${field.name}」暂不支持在服务端 SQL 直接筛选`,
        );
      }

      const expr = safeJsonPathExpr(field.id);

      switch (cond.operator) {
        case 'is_empty':
          condClauses.push(`(${expr} IS NULL OR ${expr} = '' OR ${expr} = '[]')`);
          break;

        case 'is_not_empty':
          condClauses.push(`(${expr} IS NOT NULL AND ${expr} != '' AND ${expr} != '[]')`);
          break;

        case 'eq':
          if (cond.value === null || cond.value === undefined) {
            condClauses.push(`${expr} IS NULL`);
          } else {
            condClauses.push(`${expr} = ?`);
            params.push(toSqlScalar(cond.value as string | number | boolean));
          }
          break;

        case 'neq':
          if (cond.value === null || cond.value === undefined) {
            condClauses.push(`${expr} IS NOT NULL`);
          } else {
            condClauses.push(`(${expr} IS NULL OR ${expr} != ?)`);
            params.push(toSqlScalar(cond.value as string | number | boolean));
          }
          break;

        case 'contains':
          condClauses.push(`LOWER(COALESCE(CAST(${expr} AS TEXT), '')) LIKE ?`);
          params.push(`%${String(cond.value ?? '').toLowerCase()}%`);
          break;

        case 'not_contains':
          condClauses.push(`LOWER(COALESCE(CAST(${expr} AS TEXT), '')) NOT LIKE ?`);
          params.push(`%${String(cond.value ?? '').toLowerCase()}%`);
          break;

        case 'gt':
          condClauses.push(`CAST(${expr} AS REAL) > ?`);
          params.push(Number(cond.value ?? 0));
          break;

        case 'gte':
          condClauses.push(`CAST(${expr} AS REAL) >= ?`);
          params.push(Number(cond.value ?? 0));
          break;

        case 'lt':
          condClauses.push(`CAST(${expr} AS REAL) < ?`);
          params.push(Number(cond.value ?? 0));
          break;

        case 'lte':
          condClauses.push(`CAST(${expr} AS REAL) <= ?`);
          params.push(Number(cond.value ?? 0));
          break;

        case 'in': {
          const list = Array.isArray(cond.value) ? cond.value : [cond.value];
          const cleanList = list.filter((v): v is string | number => v !== null && v !== undefined);
          if (cleanList.length === 0) {
            condClauses.push('1 = 0');
          } else {
            const placeholders = cleanList.map(() => '?').join(', ');
            condClauses.push(`${expr} IN (${placeholders})`);
            for (const item of cleanList) {
              params.push(item);
            }
          }
          break;
        }
      }
    }

    if (condClauses.length > 0) {
      const joiner = options.filter.conjunction === 'or' ? ' OR ' : ' AND ';
      rootClauses.push(`(${condClauses.join(joiner)})`);
    }
  }

  // 3. 排序规则编译
  const orderClauses: string[] = [];
  if (options.sorts && options.sorts.length > 0) {
    for (const sort of options.sorts) {
      const field = resolveField(options.fields, sort.field, options.fieldKeyType);
      if (!field || COMPUTED_FIELD_TYPES.has(field.type)) {
        continue;
      }
      const expr = safeJsonPathExpr(field.id);
      const dir = sort.direction === 'desc' ? 'DESC' : 'ASC';
      if (field.type === 'number') {
        orderClauses.push(`CASE WHEN ${expr} IS NULL THEN 1 ELSE 0 END ASC, CAST(${expr} AS REAL) ${dir}`);
      } else {
        orderClauses.push(`CASE WHEN ${expr} IS NULL THEN 1 ELSE 0 END ASC, ${expr} ${dir}`);
      }
    }
  }
  orderClauses.push('rank ASC, created_at ASC');

  return {
    whereSql: rootClauses.join(' AND '),
    orderBySql: orderClauses.join(', '),
    params,
  };
}
