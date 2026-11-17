import {
  AttachmentItemSchema,
  COMPUTED_FIELD_TYPES,
  type FieldKeyType,
  type FieldMeta,
} from '@flaretable/shared';
import { AppError } from '../utils/response.js';

/**
 * 校验并规范化单个单元格的值，使其严格符合字段类型契约
 */
export function normalizeCellValue(field: FieldMeta, rawValue: unknown): unknown {
  if (COMPUTED_FIELD_TYPES.has(field.type)) {
    throw new AppError(400, 'READONLY_COMPUTED_FIELD', `字段「${field.name}」为计算列，不允许直接写入`);
  }

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return field.type === 'checkbox' ? false : null;
  }

  switch (field.type) {
    case 'text':
      return typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);

    case 'number': {
      const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(num)) {
        throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要有效的数字`);
      }
      return num;
    }

    case 'checkbox': {
      if (typeof rawValue === 'boolean') return rawValue;
      if (rawValue === 'true' || rawValue === 1 || rawValue === '1') return true;
      if (rawValue === 'false' || rawValue === 0 || rawValue === '0') return false;
      throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要布尔值`);
    }

    case 'single_select': {
      const val = String(rawValue).trim();
      if (!val) return null;
      const choices = field.options.choices ?? [];
      if (choices.length > 0 && !choices.some((c) => c.name === val || c.id === val)) {
        // 自动宽容匹配：若传入选项 ID 则转为选项名称，未配置严格封闭集则允许保留文本以便自动化写入
        return val;
      }
      const matched = choices.find((c) => c.id === val);
      return matched ? matched.name : val;
    }

    case 'multi_select': {
      const arr = Array.isArray(rawValue)
        ? rawValue.map((item) => String(item).trim()).filter(Boolean)
        : String(rawValue)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
      const choices = field.options.choices ?? [];
      return arr.map((item) => choices.find((c) => c.id === item)?.name ?? item);
    }

    case 'date': {
      const str = String(rawValue).trim();
      const parsed = Date.parse(str);
      if (Number.isNaN(parsed)) {
        throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要合法的 ISO 日期字符串`);
      }
      return str;
    }

    case 'url': {
      const str = String(rawValue).trim();
      try {
        new URL(str);
        return str;
      } catch {
        throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要合法的 URL 地址`);
      }
    }

    case 'email': {
      const str = String(rawValue).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
        throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要合法的电子邮箱`);
      }
      return str;
    }

    case 'json': {
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch {
          throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」JSON 字符串语法无效`);
        }
      }
      if (typeof rawValue === 'object') {
        return rawValue;
      }
      throw new AppError(400, 'INVALID_FIELD_VALUE', `字段「${field.name}」需要 JSON 对象或数组`);
    }

    case 'attachment': {
      const arr = Array.isArray(rawValue) ? rawValue : [rawValue];
      return arr.map((item) => AttachmentItemSchema.parse(item));
    }

    case 'link': {
      const ids = Array.isArray(rawValue)
        ? rawValue.map((v) => String(v).trim()).filter(Boolean)
        : [String(rawValue).trim()].filter(Boolean);
      // 保留去重后的记录 ID 数组
      const uniqueIds = Array.from(new Set(ids));
      if (field.options.allowMultiple === false && uniqueIds.length > 1) {
        return [uniqueIds[0]!];
      }
      return uniqueIds;
    }

    default:
      return rawValue;
  }
}

/**
 * 构建字段查找索引（同时支持 fld_xxx 与字段名称查找）
 */
export function resolveField(fields: FieldMeta[], key: string, keyType?: FieldKeyType): FieldMeta | undefined {
  if (keyType === 'id') {
    return fields.find((f) => f.id === key);
  }
  if (keyType === 'name') {
    return fields.find((f) => f.name === key) ?? fields.find((f) => f.id === key);
  }
  return fields.find((f) => f.id === key || f.name === key);
}

/**
 * 将外部传入的键名字典（字段名或 fld_xxx）映射为内部规范化的 fld_xxx 数据字典
 */
export function mapInputFieldsToIds(
  fields: FieldMeta[],
  input: Record<string, unknown>,
  keyType: FieldKeyType,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [rawKey, rawVal] of Object.entries(input)) {
    const field = resolveField(fields, rawKey, keyType);
    if (!field) {
      throw new AppError(400, 'UNKNOWN_FIELD', `未找到字段「${rawKey}」（当前匹配模式：${keyType}）`);
    }
    if (COMPUTED_FIELD_TYPES.has(field.type)) {
      // 宽容忽略外部误传的只读公式/Lookup字段回写，防止 n8n 整行回传时报错
      continue;
    }
    mapped[field.id] = normalizeCellValue(field, rawVal);
  }

  return mapped;
}

/**
 * 生成供记录全文检索的归一化纯文本摘要
 */
export function buildSearchText(fields: FieldMeta[], dataById: Record<string, unknown>): string {
  const chunks: string[] = [];
  for (const field of fields) {
    if (COMPUTED_FIELD_TYPES.has(field.type)) continue;
    const val = dataById[field.id];
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      chunks.push(String(val));
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string') {
          chunks.push(item);
        } else if (item && typeof item === 'object' && 'name' in item) {
          chunks.push(String((item as { name: unknown }).name));
        }
      }
    } else if (typeof val === 'object') {
      chunks.push(JSON.stringify(val));
    }
  }
  return chunks.join(' ').toLowerCase();
}

/**
 * 将内部 `fld_xxx` 键对象投影为按中文/英文字段名键的对象
 */
export function projectFieldsByName(
  fields: FieldMeta[],
  dataById: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.id in dataById) {
      result[field.name] = dataById[field.id];
    }
  }
  return result;
}
