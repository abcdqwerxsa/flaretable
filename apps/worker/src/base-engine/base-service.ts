import {
  COMPUTED_FIELD_TYPES,
  generateId,
  type ActorInfo,
  type AutomationEvent,
  type FieldKeyType,
  type FieldMeta,
  type FieldOptions,
  type FieldType,
  type FilterGroup,
  type RecordItem,
  type SortSpec,
  type TableMeta,
  type TableWithSchema,
  type ViewConfig,
  type ViewMeta,
  type ViewType,
} from '@flaretable/shared';
import type { SyncSqlDriver } from './sql-driver.js';
import { ensureBaseSchema, ensureFieldExpressionIndex } from './schema-init.js';
import { nextRankAfter } from './fractional-rank.js';
import {
  buildSearchText,
  mapInputFieldsToIds,
  normalizeCellValue,
  projectFieldsByName,
  resolveField,
} from './field-validator.js';
import { computeFormulaValuesForRow } from './formula-engine.js';
import { compileRecordQuery } from './query-compiler.js';
import { AppError } from '../utils/response.js';

interface TableRow {
  id: string;
  name: string;
  description: string;
  primary_field_id: string;
  rank: string;
  created_at: string;
  updated_at: string;
}

interface FieldRow {
  id: string;
  table_id: string;
  name: string;
  type: string;
  options_json: string;
  is_primary: number;
  is_computed: number;
  rank: string;
  created_at: string;
  updated_at: string;
}

interface ViewRow {
  id: string;
  table_id: string;
  name: string;
  type: string;
  config_json: string;
  rank: string;
  created_at: string;
  updated_at: string;
}

interface RecordRow {
  id: string;
  table_id: string;
  data_json: string;
  search_text: string;
  rank: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MutationResult<T> {
  data: T;
  events: AutomationEvent[];
}

export interface UpsertRecordEntry {
  action: 'created' | 'updated';
  record: RecordItem;
}

export interface UpsertResult {
  createdCount: number;
  updatedCount: number;
  records: UpsertRecordEntry[];
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapTableRow(row: TableRow): TableMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    primaryFieldId: row.primary_field_id,
    rank: row.rank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFieldRow(row: FieldRow): FieldMeta {
  return {
    id: row.id,
    tableId: row.table_id,
    name: row.name,
    type: row.type as FieldType,
    options: parseJsonSafe<FieldOptions>(row.options_json, {}),
    isPrimary: row.is_primary === 1,
    isComputed: row.is_computed === 1,
    rank: row.rank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapViewRow(row: ViewRow): ViewMeta {
  return {
    id: row.id,
    tableId: row.table_id,
    name: row.name,
    type: row.type as ViewType,
    config: parseJsonSafe<ViewConfig>(row.config_json, {}),
    rank: row.rank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 单个多维表格空间（Base）的核心数据面引擎服务
 * @description 封装全部元数据管理、行记录 CRUD、幂等 Upsert、跨表关联同步、Lookup 水合与公式计算逻辑。
 */
export class BaseService {
  constructor(
    private readonly baseId: string,
    private readonly sql: SyncSqlDriver,
  ) {
    ensureBaseSchema(this.sql);
  }

  // ==================== Schema 元数据读写 ====================

  listTables(): TableMeta[] {
    const rows = this.sql.exec<Record<string, unknown>>(
      'SELECT * FROM tables_meta ORDER BY rank ASC, created_at ASC',
    );
    return rows.map((r) => mapTableRow(r as unknown as TableRow));
  }

  getTableOrThrow(tableIdOrName: string): TableMeta {
    const rows = this.sql.exec<Record<string, unknown>>(
      'SELECT * FROM tables_meta WHERE id = ? OR name = ? LIMIT 1',
      tableIdOrName,
      tableIdOrName,
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'TABLE_NOT_FOUND', `未找到数据表「${tableIdOrName}」`);
    }
    return mapTableRow(row as unknown as TableRow);
  }

  listFields(tableId: string): FieldMeta[] {
    const rows = this.sql.exec<Record<string, unknown>>(
      'SELECT * FROM fields_meta WHERE table_id = ? ORDER BY rank ASC, created_at ASC',
      tableId,
    );
    return rows.map((r) => mapFieldRow(r as unknown as FieldRow));
  }

  listViews(tableId: string): ViewMeta[] {
    const rows = this.sql.exec<Record<string, unknown>>(
      'SELECT * FROM views_meta WHERE table_id = ? ORDER BY rank ASC, created_at ASC',
      tableId,
    );
    return rows.map((r) => mapViewRow(r as unknown as ViewRow));
  }

  getFullSchema(): TableWithSchema[] {
    const tables = this.listTables();
    return tables.map((tbl) => ({
      ...tbl,
      fields: this.listFields(tbl.id),
      views: this.listViews(tbl.id),
    }));
  }

  /**
   * 为新建多维表格空间初始化飞书风格默认空白表结构（1张空白表 + 基础空白列，0条记录）
   */
  initBlankBase(): { tableCount: number; tables: TableWithSchema[] } {
    this.createTable({
      name: '数据表 1',
      description: '',
      primaryFieldName: '文本',
      includeStarterFields: true,
    });
    const tables = this.getFullSchema();
    return { tableCount: tables.length, tables };
  }

  createTable(input: {
    name: string;
    description?: string;
    primaryFieldName?: string;
    createDefaultGridView?: boolean;
    includeStarterFields?: boolean;
  }): TableWithSchema {
    return this.sql.transaction(() => {
      const now = new Date().toISOString();
      const tableId = generateId('tbl');
      const primaryFieldId = generateId('fld');

      const lastTable = this.sql.exec<Record<string, unknown>>(
        'SELECT rank FROM tables_meta ORDER BY rank DESC LIMIT 1',
      )[0];
      const rank = nextRankAfter((lastTable?.rank as string | undefined) ?? null);

      this.sql.exec(
        `INSERT INTO tables_meta (id, name, description, primary_field_id, rank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        tableId,
        input.name.trim(),
        input.description ?? '',
        primaryFieldId,
        rank,
        now,
        now,
      );

      this.sql.exec(
        `INSERT INTO fields_meta (id, table_id, name, type, options_json, is_primary, is_computed, rank, created_at, updated_at)
         VALUES (?, ?, ?, 'text', '{}', 1, 0, 'a0', ?, ?)`,
        primaryFieldId,
        tableId,
        (input.primaryFieldName ?? '文本').trim(),
        now,
        now,
      );
      ensureFieldExpressionIndex(this.sql, primaryFieldId);

      // 飞书多维表格标准空白开箱列（不含业务假数据，仅提供空白的单选与日期列）
      if (input.includeStarterFields) {
        const selectId = generateId('fld');
        const dateId = generateId('fld');
        const defaultSelectOptions: FieldOptions = {
          choices: [
            { id: 'opt_1', name: '选项 1', color: 'blue' },
            { id: 'opt_2', name: '选项 2', color: 'emerald' },
          ],
        };
        this.sql.exec(
          `INSERT INTO fields_meta (id, table_id, name, type, options_json, is_primary, is_computed, rank, created_at, updated_at)
           VALUES (?, ?, '单选', 'single_select', ?, 0, 0, 'a1', ?, ?)`,
          selectId,
          tableId,
          JSON.stringify(defaultSelectOptions),
          now,
          now,
        );
        ensureFieldExpressionIndex(this.sql, selectId);

        this.sql.exec(
          `INSERT INTO fields_meta (id, table_id, name, type, options_json, is_primary, is_computed, rank, created_at, updated_at)
           VALUES (?, ?, '日期', 'date', '{}', 0, 0, 'a2', ?, ?)`,
          dateId,
          tableId,
          now,
          now,
        );
        ensureFieldExpressionIndex(this.sql, dateId);
      }

      const views: ViewMeta[] = [];
      if (input.createDefaultGridView !== false) {
        const viewId = generateId('vw');
        this.sql.exec(
          `INSERT INTO views_meta (id, table_id, name, type, config_json, rank, created_at, updated_at)
           VALUES (?, ?, '表格视图', 'grid', '{}', 'a0', ?, ?)`,
          viewId,
          tableId,
          now,
          now,
        );
        views.push(...this.listViews(tableId));
      }

      const table = this.getTableOrThrow(tableId);
      return {
        ...table,
        fields: this.listFields(tableId),
        views,
      };
    });
  }

  updateTable(tableId: string, input: { name: string; description?: string }): TableMeta {
    return this.sql.transaction(() => {
      const current = this.getTableOrThrow(tableId);
      const nextName = input.name.trim();
      const tables = this.listTables();
      if (nextName !== current.name && tables.some((t) => t.name === nextName && t.id !== tableId)) {
        throw new AppError(409, 'DUPLICATE_TABLE_NAME', `已存在同名数据表「${nextName}」`);
      }

      const nextDesc = input.description ?? current.description;
      const now = new Date().toISOString();
      this.sql.exec(
        'UPDATE tables_meta SET name = ?, description = ?, updated_at = ? WHERE id = ?',
        nextName,
        nextDesc,
        now,
        tableId,
      );
      return this.getTableOrThrow(tableId);
    });
  }

  deleteTable(tableId: string): void {
    this.sql.transaction(() => {
      this.getTableOrThrow(tableId);
      const tables = this.listTables();
      if (tables.length <= 1) {
        throw new AppError(400, 'CANNOT_DELETE_LAST_TABLE', '工作空间至少需要保留一张数据表');
      }
      this.sql.exec(
        'DELETE FROM record_links WHERE source_table_id = ? OR target_table_id = ?',
        tableId,
        tableId,
      );
      this.sql.exec('DELETE FROM records WHERE table_id = ?', tableId);
      this.sql.exec('DELETE FROM views_meta WHERE table_id = ?', tableId);
      this.sql.exec('DELETE FROM fields_meta WHERE table_id = ?', tableId);
      this.sql.exec('DELETE FROM tables_meta WHERE id = ?', tableId);
    });
  }

  createField(
    tableIdOrName: string,
    input: {
      name: string;
      type: FieldType;
      options?: FieldOptions;
    },
    actor: ActorInfo,
  ): MutationResult<FieldMeta> {
    const table = this.getTableOrThrow(tableIdOrName);
    const existing = this.listFields(table.id);
    if (existing.some((f) => f.name === input.name.trim())) {
      throw new AppError(409, 'DUPLICATE_FIELD_NAME', `数据表「${table.name}」已存在同名字段「${input.name}」`);
    }

    const field = this.sql.transaction(() => {
      const now = new Date().toISOString();
      const fieldId = generateId('fld');
      const lastRank = existing[existing.length - 1]?.rank ?? null;
      const rank = nextRankAfter(lastRank);
      const isComputed = COMPUTED_FIELD_TYPES.has(input.type) ? 1 : 0;
      const options: FieldOptions = { ...(input.options ?? {}) };

      // 校验 link 字段配置；若目标表存在且未指定反向字段，可按需创建对称关联字段
      if (input.type === 'link') {
        if (!options.targetTableId) {
          throw new AppError(400, 'INVALID_LINK_FIELD', '关联记录字段必须指定目标数据表 targetTableId');
        }
        const targetTable = this.getTableOrThrow(options.targetTableId);
        options.targetTableId = targetTable.id;

        if (!options.symmetricFieldId && targetTable.id !== table.id) {
          const symId = generateId('fld');
          const targetFields = this.listFields(targetTable.id);
          const symRank = nextRankAfter(targetFields[targetFields.length - 1]?.rank ?? null);
          const symOptions: FieldOptions = {
            targetTableId: table.id,
            allowMultiple: true,
            symmetricFieldId: fieldId,
          };
          this.sql.exec(
            `INSERT INTO fields_meta (id, table_id, name, type, options_json, is_primary, is_computed, rank, created_at, updated_at)
             VALUES (?, ?, ?, 'link', ?, 0, 0, ?, ?, ?)`,
            symId,
            targetTable.id,
            `关联的${table.name}`,
            JSON.stringify(symOptions),
            symRank,
            now,
            now,
          );
          options.symmetricFieldId = symId;
        }
      }

      if (input.type === 'lookup') {
        if (!options.linkFieldId || !options.targetFieldId) {
          throw new AppError(400, 'INVALID_LOOKUP_FIELD', '查找引用字段必须指定 linkFieldId 与 targetFieldId');
        }
      }

      this.sql.exec(
        `INSERT INTO fields_meta (id, table_id, name, type, options_json, is_primary, is_computed, rank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        fieldId,
        table.id,
        input.name.trim(),
        input.type,
        JSON.stringify(options),
        isComputed,
        rank,
        now,
        now,
      );

      if (!isComputed) {
        ensureFieldExpressionIndex(this.sql, fieldId);
      }

      const created = this.listFields(table.id).find((f) => f.id === fieldId)!;
      return created;
    });

    const event: AutomationEvent = {
      eventId: generateId('evt'),
      eventType: 'field.created',
      timestamp: new Date().toISOString(),
      baseId: this.baseId,
      tableId: table.id,
      actor,
      data: { field },
    };

    return { data: field, events: [event] };
  }

  updateField(
    tableId: string,
    fieldId: string,
    input: { name?: string; options?: FieldOptions },
  ): FieldMeta {
    return this.sql.transaction(() => {
      const fields = this.listFields(tableId);
      const current = fields.find((f) => f.id === fieldId);
      if (!current) {
        throw new AppError(404, 'FIELD_NOT_FOUND', `未找到字段「${fieldId}」`);
      }

      const nextName = input.name?.trim() ?? current.name;
      if (nextName !== current.name && fields.some((f) => f.name === nextName && f.id !== fieldId)) {
        throw new AppError(409, 'DUPLICATE_FIELD_NAME', `字段名称「${nextName}」已被占用`);
      }

      const nextOptions = input.options ? { ...current.options, ...input.options } : current.options;
      const now = new Date().toISOString();

      this.sql.exec(
        `UPDATE fields_meta SET name = ?, options_json = ?, updated_at = ? WHERE id = ? AND table_id = ?`,
        nextName,
        JSON.stringify(nextOptions),
        now,
        fieldId,
        tableId,
      );

      return this.listFields(tableId).find((f) => f.id === fieldId)!;
    });
  }

  deleteField(tableId: string, fieldId: string): void {
    this.sql.transaction(() => {
      const fields = this.listFields(tableId);
      const field = fields.find((f) => f.id === fieldId);
      if (!field) {
        throw new AppError(404, 'FIELD_NOT_FOUND', `未找到字段「${fieldId}」`);
      }
      if (field.isPrimary) {
        throw new AppError(400, 'CANNOT_DELETE_PRIMARY_FIELD', '主展示字段不允许删除');
      }

      this.sql.exec('DELETE FROM record_links WHERE source_field_id = ?', fieldId);
      this.sql.exec('DELETE FROM fields_meta WHERE id = ? AND table_id = ?', fieldId, tableId);
    });
  }

  createView(
    tableId: string,
    input: { name: string; type: ViewType; config?: ViewConfig },
  ): ViewMeta {
    return this.sql.transaction(() => {
      this.getTableOrThrow(tableId);
      const views = this.listViews(tableId);
      const rank = nextRankAfter(views[views.length - 1]?.rank ?? null);
      const viewId = generateId('vw');
      const now = new Date().toISOString();
      this.sql.exec(
        `INSERT INTO views_meta (id, table_id, name, type, config_json, rank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        viewId,
        tableId,
        input.name.trim(),
        input.type,
        JSON.stringify(input.config ?? {}),
        rank,
        now,
        now,
      );
      return this.listViews(tableId).find((v) => v.id === viewId)!;
    });
  }

  updateView(
    tableId: string,
    viewId: string,
    input: { name?: string; config?: ViewConfig },
  ): ViewMeta {
    return this.sql.transaction(() => {
      const views = this.listViews(tableId);
      const current = views.find((v) => v.id === viewId);
      if (!current) {
        throw new AppError(404, 'VIEW_NOT_FOUND', `未找到视图「${viewId}」`);
      }
      const nextName = input.name?.trim() ?? current.name;
      const nextConfig = input.config ? { ...current.config, ...input.config } : current.config;
      const now = new Date().toISOString();

      this.sql.exec(
        `UPDATE views_meta SET name = ?, config_json = ?, updated_at = ? WHERE id = ? AND table_id = ?`,
        nextName,
        JSON.stringify(nextConfig),
        now,
        viewId,
        tableId,
      );

      return this.listViews(tableId).find((v) => v.id === viewId)!;
    });
  }

  deleteView(tableId: string, viewId: string): void {
    this.sql.transaction(() => {
      const views = this.listViews(tableId);
      if (!views.some((v) => v.id === viewId)) {
        throw new AppError(404, 'VIEW_NOT_FOUND', `未找到视图「${viewId}」`);
      }
      if (views.length <= 1) {
        throw new AppError(400, 'CANNOT_DELETE_LAST_VIEW', '数据表至少需要保留一个视图');
      }
      this.sql.exec('DELETE FROM views_meta WHERE id = ? AND table_id = ?', viewId, tableId);
    });
  }

  // ==================== 记录读写、关联与计算水合 ====================

  /**
   * 批量水合 lookup 字段与 formula 计算字段，并生成 fieldsByName
   */
  private hydrateRecords(tableId: string, rows: RecordRow[]): RecordItem[] {
    if (rows.length === 0) return [];
    const fields = this.listFields(tableId);
    const lookupFields = fields.filter((f) => f.type === 'lookup');

    // 1. 收集当前批记录涉及的全部目标表与目标记录 ID，消除 N+1 查询
    const targetRecordsById = new Map<string, Record<string, unknown>>();
    const targetTablePrimaryField = new Map<string, string>();

    if (lookupFields.length > 0) {
      const targetIds = new Set<string>();
      for (const row of rows) {
        const data = parseJsonSafe<Record<string, unknown>>(row.data_json, {});
        for (const lf of lookupFields) {
          const linkId = lf.options.linkFieldId;
          if (!linkId) continue;
          const linkedVal = data[linkId];
          if (Array.isArray(linkedVal)) {
            for (const id of linkedVal) {
              if (typeof id === 'string') targetIds.add(id);
            }
          }
        }
      }

      if (targetIds.size > 0) {
        const idList = Array.from(targetIds);
        const placeholders = idList.map(() => '?').join(', ');
        const targetRows = this.sql.exec<Record<string, unknown>>(
          `SELECT id, table_id, data_json FROM records WHERE id IN (${placeholders})`,
          ...idList,
        );
        for (const tr of targetRows) {
          const r = tr as unknown as { id: string; table_id: string; data_json: string };
          targetRecordsById.set(r.id, parseJsonSafe<Record<string, unknown>>(r.data_json, {}));
        }
      }

      for (const tbl of this.listTables()) {
        targetTablePrimaryField.set(tbl.id, tbl.primaryFieldId);
      }
    }

    // 2. 依次填充 lookup 值并计算 formula AST
    return rows.map((row) => {
      const baseData = parseJsonSafe<Record<string, unknown>>(row.data_json, {});

      for (const lf of lookupFields) {
        const linkFieldId = lf.options.linkFieldId;
        const targetFieldId = lf.options.targetFieldId;
        if (!linkFieldId || !targetFieldId) {
          baseData[lf.id] = [];
          continue;
        }
        const linkedIds = Array.isArray(baseData[linkFieldId])
          ? (baseData[linkFieldId] as string[])
          : [];
        const values: unknown[] = [];
        for (const recId of linkedIds) {
          const targetData = targetRecordsById.get(recId);
          if (targetData && targetData[targetFieldId] !== undefined && targetData[targetFieldId] !== null) {
            values.push(targetData[targetFieldId]);
          }
        }
        // 当只关联一条时如果是数字或单值，保持数组或标量直观展示；这里统一在多条时返回数组，单条返回该标量便于公式计算！
        baseData[lf.id] = values.length === 1 ? values[0] : values;
      }

      const computedData = computeFormulaValuesForRow(fields, baseData);

      return {
        id: row.id,
        tableId: row.table_id,
        rank: row.rank,
        version: row.version,
        fields: computedData,
        fieldsByName: projectFieldsByName(fields, computedData),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * 同步更新单个 link 字段产生的关联边及对称表的反向关联数组
   */
  private syncLinkFieldRelations(
    sourceTableId: string,
    linkField: FieldMeta,
    sourceRecordId: string,
    nextTargetIds: string[],
  ): void {
    const targetTableId = linkField.options.targetTableId;
    if (!targetTableId) return;

    // 读取原有边以确定需解除与新增的对称链接
    const prevEdgeRows = this.sql.exec<Record<string, unknown>>(
      'SELECT target_record_id FROM record_links WHERE source_field_id = ? AND source_record_id = ?',
      linkField.id,
      sourceRecordId,
    );
    const prevSet = new Set(prevEdgeRows.map((r) => String(r.target_record_id)));
    const nextSet = new Set(nextTargetIds);

    // 校验目标记录存在性（过滤不存在的幽灵 ID）
    let validTargetIds = nextTargetIds;
    if (nextTargetIds.length > 0) {
      const placeholders = nextTargetIds.map(() => '?').join(', ');
      const existingRows = this.sql.exec<Record<string, unknown>>(
        `SELECT id FROM records WHERE table_id = ? AND id IN (${placeholders})`,
        targetTableId,
        ...nextTargetIds,
      );
      const validSet = new Set(existingRows.map((r) => String(r.id)));
      validTargetIds = nextTargetIds.filter((id) => validSet.has(id));
    }

    this.sql.exec(
      'DELETE FROM record_links WHERE source_field_id = ? AND source_record_id = ?',
      linkField.id,
      sourceRecordId,
    );

    for (const targetId of validTargetIds) {
      this.sql.exec(
        `INSERT OR IGNORE INTO record_links
         (source_table_id, source_field_id, source_record_id, target_table_id, target_record_id)
         VALUES (?, ?, ?, ?, ?)`,
        sourceTableId,
        linkField.id,
        sourceRecordId,
        targetTableId,
        targetId,
      );
    }

    // 维护对称反向字段（如果有配置）
    const symFieldId = linkField.options.symmetricFieldId;
    if (!symFieldId) return;

    const toRemove = Array.from(prevSet).filter((id) => !nextSet.has(id));
    const toAdd = validTargetIds.filter((id) => !prevSet.has(id));
    const now = new Date().toISOString();

    for (const targetRecId of [...toRemove, ...toAdd]) {
      const targetRow = this.sql.exec<Record<string, unknown>>(
        'SELECT data_json, version FROM records WHERE id = ? AND table_id = ?',
        targetRecId,
        targetTableId,
      )[0] as unknown as { data_json: string; version: number } | undefined;
      if (!targetRow) continue;

      const data = parseJsonSafe<Record<string, unknown>>(targetRow.data_json, {});
      const curLinks = Array.isArray(data[symFieldId]) ? (data[symFieldId] as string[]) : [];
      const curSet = new Set(curLinks);

      if (toRemove.includes(targetRecId)) {
        curSet.delete(sourceRecordId);
        this.sql.exec(
          'DELETE FROM record_links WHERE source_field_id = ? AND source_record_id = ? AND target_record_id = ?',
          symFieldId,
          targetRecId,
          sourceRecordId,
        );
      } else {
        curSet.add(sourceRecordId);
        this.sql.exec(
          `INSERT OR IGNORE INTO record_links
           (source_table_id, source_field_id, source_record_id, target_table_id, target_record_id)
           VALUES (?, ?, ?, ?, ?)`,
          targetTableId,
          symFieldId,
          targetRecId,
          sourceTableId,
          sourceRecordId,
        );
      }

      data[symFieldId] = Array.from(curSet);
      this.sql.exec(
        'UPDATE records SET data_json = ?, version = version + 1, updated_at = ? WHERE id = ?',
        JSON.stringify(data),
        now,
        targetRecId,
      );
    }
  }

  queryRecords(
    tableIdOrName: string,
    options?: {
      fieldKeyType?: FieldKeyType;
      filter?: FilterGroup;
      sorts?: SortSpec[];
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): { total: number; records: RecordItem[] } {
    const table = this.getTableOrThrow(tableIdOrName);
    const fields = this.listFields(table.id);
    const compiled = compileRecordQuery({
      tableId: table.id,
      fields,
      fieldKeyType: options?.fieldKeyType ?? 'id',
      filter: options?.filter,
      sorts: options?.sorts,
      search: options?.search,
    });

    const countRow = this.sql.exec<Record<string, unknown>>(
      `SELECT COUNT(*) AS cnt FROM records WHERE ${compiled.whereSql}`,
      ...compiled.params,
    )[0];
    const total = Number(countRow?.cnt ?? 0);

    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const offset = Math.max(options?.offset ?? 0, 0);

    const rows = this.sql.exec<Record<string, unknown>>(
      `SELECT * FROM records WHERE ${compiled.whereSql} ORDER BY ${compiled.orderBySql} LIMIT ? OFFSET ?`,
      ...compiled.params,
      limit,
      offset,
    );

    const hydrated = this.hydrateRecords(
      table.id,
      rows.map((r) => r as unknown as RecordRow),
    );
    return { total, records: hydrated };
  }

  getRecordOrThrow(tableIdOrName: string, recordId: string): RecordItem {
    const table = this.getTableOrThrow(tableIdOrName);
    const row = this.sql.exec<Record<string, unknown>>(
      'SELECT * FROM records WHERE id = ? AND table_id = ?',
      recordId,
      table.id,
    )[0] as unknown as RecordRow | undefined;
    if (!row) {
      throw new AppError(404, 'RECORD_NOT_FOUND', `未找到记录「${recordId}」`);
    }
    return this.hydrateRecords(table.id, [row])[0]!;
  }

  createRecords(
    tableIdOrName: string,
    items: Array<{ fields: Record<string, unknown> }>,
    fieldKeyType: FieldKeyType,
    actor: ActorInfo,
  ): MutationResult<RecordItem[]> {
    const table = this.getTableOrThrow(tableIdOrName);
    const fields = this.listFields(table.id);
    const linkFields = fields.filter((f) => f.type === 'link');

    const createdIds = this.sql.transaction(() => {
      const now = new Date().toISOString();
      const lastRankRow = this.sql.exec<Record<string, unknown>>(
        'SELECT rank FROM records WHERE table_id = ? ORDER BY rank DESC LIMIT 1',
        table.id,
      )[0];
      let currentRank = (lastRankRow?.rank as string | undefined) ?? null;

      const ids: string[] = [];
      for (const item of items) {
        const recId = generateId('rec');
        currentRank = nextRankAfter(currentRank);
        const mappedData = mapInputFieldsToIds(fields, item.fields, fieldKeyType);
        const searchText = buildSearchText(fields, mappedData);

        this.sql.exec(
          `INSERT INTO records (id, table_id, data_json, search_text, rank, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          recId,
          table.id,
          JSON.stringify(mappedData),
          searchText,
          currentRank,
          now,
          now,
        );

        for (const lf of linkFields) {
          const val = mappedData[lf.id];
          if (Array.isArray(val) && val.length > 0) {
            this.syncLinkFieldRelations(table.id, lf, recId, val as string[]);
          }
        }

        ids.push(recId);
      }
      return ids;
    });

    const placeholders = createdIds.map(() => '?').join(', ');
    const rows = this.sql.exec<Record<string, unknown>>(
      `SELECT * FROM records WHERE id IN (${placeholders}) ORDER BY rank ASC`,
      ...createdIds,
    );
    const hydrated = this.hydrateRecords(
      table.id,
      rows.map((r) => r as unknown as RecordRow),
    );

    const eventType = actor.type === 'public_form' ? 'form.submitted' : 'record.created';
    const events: AutomationEvent[] = hydrated.map((record) => ({
      eventId: generateId('evt'),
      eventType,
      timestamp: new Date().toISOString(),
      baseId: this.baseId,
      tableId: table.id,
      actor,
      data: { record },
    }));

    return { data: hydrated, events };
  }

  updateRecords(
    tableIdOrName: string,
    items: Array<{ id: string; expectedVersion?: number; fields: Record<string, unknown> }>,
    fieldKeyType: FieldKeyType,
    actor: ActorInfo,
  ): MutationResult<RecordItem[]> {
    const table = this.getTableOrThrow(tableIdOrName);
    const fields = this.listFields(table.id);
    const linkFields = fields.filter((f) => f.type === 'link');

    const updatedIds = this.sql.transaction(() => {
      const now = new Date().toISOString();
      const ids: string[] = [];

      for (const item of items) {
        const row = this.sql.exec<Record<string, unknown>>(
          'SELECT * FROM records WHERE id = ? AND table_id = ?',
          item.id,
          table.id,
        )[0] as unknown as RecordRow | undefined;

        if (!row) {
          throw new AppError(404, 'RECORD_NOT_FOUND', `未找到待更新记录「${item.id}」`);
        }

        if (item.expectedVersion !== undefined && row.version !== item.expectedVersion) {
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            `记录「${item.id}」已被他人修改（当前版本 ${row.version}，预期 ${item.expectedVersion}）`,
          );
        }

        const existingData = parseJsonSafe<Record<string, unknown>>(row.data_json, {});
        const patchData = mapInputFieldsToIds(fields, item.fields, fieldKeyType);
        const mergedData = { ...existingData, ...patchData };
        const searchText = buildSearchText(fields, mergedData);

        this.sql.exec(
          `UPDATE records SET data_json = ?, search_text = ?, version = version + 1, updated_at = ?
           WHERE id = ? AND table_id = ?`,
          JSON.stringify(mergedData),
          searchText,
          now,
          item.id,
          table.id,
        );

        for (const lf of linkFields) {
          if (lf.id in patchData) {
            const val = mergedData[lf.id];
            this.syncLinkFieldRelations(
              table.id,
              lf,
              item.id,
              Array.isArray(val) ? (val as string[]) : [],
            );
          }
        }

        ids.push(item.id);
      }

      return ids;
    });

    const placeholders = updatedIds.map(() => '?').join(', ');
    const rows = this.sql.exec<Record<string, unknown>>(
      `SELECT * FROM records WHERE id IN (${placeholders})`,
      ...updatedIds,
    );
    const byId = new Map(
      this.hydrateRecords(
        table.id,
        rows.map((r) => r as unknown as RecordRow),
      ).map((rec) => [rec.id, rec]),
    );
    const ordered = updatedIds.map((id) => byId.get(id)!);

    const events: AutomationEvent[] = ordered.map((record) => ({
      eventId: generateId('evt'),
      eventType: 'record.updated',
      timestamp: new Date().toISOString(),
      baseId: this.baseId,
      tableId: table.id,
      actor,
      data: { record },
    }));

    return { data: ordered, events };
  }

  /**
   * 幂等 Upsert：根据指定业务唯一键自动决定插入新记录或合并更新现有记录
   */
  upsertRecords(
    tableIdOrName: string,
    matchFieldKey: string,
    items: Array<{ fields: Record<string, unknown> }>,
    fieldKeyType: FieldKeyType,
    actor: ActorInfo,
  ): MutationResult<UpsertResult> {
    const table = this.getTableOrThrow(tableIdOrName);
    const fields = this.listFields(table.id);
    const matchField = resolveField(fields, matchFieldKey, fieldKeyType);
    if (!matchField) {
      throw new AppError(400, 'UNKNOWN_MATCH_FIELD', `Upsert 唯一匹配字段「${matchFieldKey}」不存在`);
    }
    if (COMPUTED_FIELD_TYPES.has(matchField.type)) {
      throw new AppError(400, 'INVALID_MATCH_FIELD', '计算字段不可作为 Upsert 匹配唯一键');
    }

    const linkFields = fields.filter((f) => f.type === 'link');
    const jsonExpr = `json_extract(data_json, '$.${matchField.id}')`;

    const ops = this.sql.transaction(() => {
      const now = new Date().toISOString();
      const lastRankRow = this.sql.exec<Record<string, unknown>>(
        'SELECT rank FROM records WHERE table_id = ? ORDER BY rank DESC LIMIT 1',
        table.id,
      )[0];
      let currentRank = (lastRankRow?.rank as string | undefined) ?? null;

      const results: Array<{ id: string; action: 'created' | 'updated' }> = [];

      for (const item of items) {
        const mapped = mapInputFieldsToIds(fields, item.fields, fieldKeyType);
        const matchRaw = mapped[matchField.id];
        if (matchRaw === undefined || matchRaw === null || matchRaw === '') {
          throw new AppError(
            400,
            'MISSING_MATCH_VALUE',
            `执行 Upsert 时记录缺少匹配字段「${matchField.name}」的值`,
          );
        }

        const normalizedMatch = normalizeCellValue(matchField, matchRaw);
        const sqlMatchParam =
          typeof normalizedMatch === 'boolean'
            ? normalizedMatch
              ? 1
              : 0
            : (normalizedMatch as string | number);

        const existingRow = this.sql.exec<Record<string, unknown>>(
          `SELECT * FROM records WHERE table_id = ? AND ${jsonExpr} = ? LIMIT 1`,
          table.id,
          sqlMatchParam,
        )[0] as unknown as RecordRow | undefined;

        if (existingRow) {
          const existingData = parseJsonSafe<Record<string, unknown>>(existingRow.data_json, {});
          const mergedData = { ...existingData, ...mapped };
          const searchText = buildSearchText(fields, mergedData);

          this.sql.exec(
            `UPDATE records SET data_json = ?, search_text = ?, version = version + 1, updated_at = ?
             WHERE id = ?`,
            JSON.stringify(mergedData),
            searchText,
            now,
            existingRow.id,
          );

          for (const lf of linkFields) {
            if (lf.id in mapped) {
              const val = mergedData[lf.id];
              this.syncLinkFieldRelations(
                table.id,
                lf,
                existingRow.id,
                Array.isArray(val) ? (val as string[]) : [],
              );
            }
          }

          results.push({ id: existingRow.id, action: 'updated' });
        } else {
          const recId = generateId('rec');
          currentRank = nextRankAfter(currentRank);
          const searchText = buildSearchText(fields, mapped);

          this.sql.exec(
            `INSERT INTO records (id, table_id, data_json, search_text, rank, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            recId,
            table.id,
            JSON.stringify(mapped),
            searchText,
            currentRank,
            now,
            now,
          );

          for (const lf of linkFields) {
            const val = mapped[lf.id];
            if (Array.isArray(val) && val.length > 0) {
              this.syncLinkFieldRelations(table.id, lf, recId, val as string[]);
            }
          }

          results.push({ id: recId, action: 'created' });
        }
      }

      return results;
    });

    const uniqueIds = Array.from(new Set(ops.map((o) => o.id)));
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const rows = this.sql.exec<Record<string, unknown>>(
      `SELECT * FROM records WHERE id IN (${placeholders})`,
      ...uniqueIds,
    );
    const hydratedMap = new Map(
      this.hydrateRecords(
        table.id,
        rows.map((r) => r as unknown as RecordRow),
      ).map((r) => [r.id, r]),
    );

    const records: UpsertRecordEntry[] = ops.map((op) => ({
      action: op.action,
      record: hydratedMap.get(op.id)!,
    }));

    const createdCount = records.filter((r) => r.action === 'created').length;
    const updatedCount = records.filter((r) => r.action === 'updated').length;

    const events: AutomationEvent[] = records.map((entry) => ({
      eventId: generateId('evt'),
      eventType: entry.action === 'created' ? 'record.created' : 'record.updated',
      timestamp: new Date().toISOString(),
      baseId: this.baseId,
      tableId: table.id,
      actor,
      data: { record: entry.record, upserted: true },
    }));

    return {
      data: { createdCount, updatedCount, records },
      events,
    };
  }

  deleteRecords(
    tableIdOrName: string,
    recordIds: string[],
    actor: ActorInfo,
  ): MutationResult<{ deletedIds: string[] }> {
    const table = this.getTableOrThrow(tableIdOrName);

    const deletedIds = this.sql.transaction(() => {
      const actuallyDeleted: string[] = [];
      const now = new Date().toISOString();

      for (const recId of recordIds) {
        const exists = this.sql.exec<Record<string, unknown>>(
          'SELECT id FROM records WHERE id = ? AND table_id = ?',
          recId,
          table.id,
        )[0];
        if (!exists) continue;

        // 清理反向被引用记录的关联数组（避免残留无效 ID）
        const incomingLinks = this.sql.exec<Record<string, unknown>>(
          'SELECT source_table_id, source_field_id, source_record_id FROM record_links WHERE target_record_id = ?',
          recId,
        );
        for (const edge of incomingLinks) {
          const srcFieldId = String(edge.source_field_id);
          const srcRecId = String(edge.source_record_id);
          const srcRow = this.sql.exec<Record<string, unknown>>(
            'SELECT data_json FROM records WHERE id = ?',
            srcRecId,
          )[0] as unknown as { data_json: string } | undefined;
          if (srcRow) {
            const data = parseJsonSafe<Record<string, unknown>>(srcRow.data_json, {});
            if (Array.isArray(data[srcFieldId])) {
              data[srcFieldId] = (data[srcFieldId] as string[]).filter((id) => id !== recId);
              this.sql.exec(
                'UPDATE records SET data_json = ?, version = version + 1, updated_at = ? WHERE id = ?',
                JSON.stringify(data),
                now,
                srcRecId,
              );
            }
          }
        }

        this.sql.exec(
          'DELETE FROM record_links WHERE source_record_id = ? OR target_record_id = ?',
          recId,
          recId,
        );
        this.sql.exec('DELETE FROM records WHERE id = ? AND table_id = ?', recId, table.id);
        actuallyDeleted.push(recId);
      }

      return actuallyDeleted;
    });

    const events: AutomationEvent[] = deletedIds.map((recId) => ({
      eventId: generateId('evt'),
      eventType: 'record.deleted',
      timestamp: new Date().toISOString(),
      baseId: this.baseId,
      tableId: table.id,
      actor,
      data: { recordId: recId },
    }));

    return { data: { deletedIds }, events };
  }
}
