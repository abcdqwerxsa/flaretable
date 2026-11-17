import type { SyncSqlDriver } from './sql-driver.js';

/**
 * 幂等初始化单个 Base 内部的 SQLite 表结构
 */
export function ensureBaseSchema(sql: SyncSqlDriver): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS tables_meta (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      primary_field_id TEXT NOT NULL,
      rank TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS fields_meta (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '{}',
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_computed INTEGER NOT NULL DEFAULT 0,
      rank TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_fields_table_rank
    ON fields_meta (table_id, rank)
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS views_meta (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      rank TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_views_table_rank
    ON views_meta (table_id, rank)
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      search_text TEXT NOT NULL DEFAULT '',
      rank TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_records_table_rank
    ON records (table_id, rank)
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS record_links (
      source_table_id TEXT NOT NULL,
      source_field_id TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      target_table_id TEXT NOT NULL,
      target_record_id TEXT NOT NULL,
      PRIMARY KEY (source_field_id, source_record_id, target_record_id)
    )
  `);

  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_record_links_target
    ON record_links (target_record_id)
  `);
}

/**
 * 支持为高筛选频率的非计算型字段创建 SQLite json_extract 表达式索引
 * @description 仅接收严格校验过的 `fld_xxx` 标识符，杜绝任何 SQL 注入可能
 */
export function ensureFieldExpressionIndex(sql: SyncSqlDriver, fieldId: string): void {
  if (!/^fld_[a-z0-9]+$/.test(fieldId)) {
    return;
  }
  const indexName = `idx_rec_${fieldId}`;
  sql.exec(
    `CREATE INDEX IF NOT EXISTS ${indexName} ON records (table_id, json_extract(data_json, '$.${fieldId}'))`,
  );
}
