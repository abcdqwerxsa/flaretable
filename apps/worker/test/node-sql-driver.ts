import { DatabaseSync } from 'node:sqlite';
import type { SqlParam, SqlRow, SyncSqlDriver } from '../src/base-engine/sql-driver.js';

/**
 * 基于 Node 24 内置 node:sqlite 的测试驱动适配器
 */
export class NodeSqlDriver implements SyncSqlDriver {
  readonly db: DatabaseSync;

  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
  }

  exec<T extends SqlRow = SqlRow>(sql: string, ...params: SqlParam[]): T[] {
    const stmt = this.db.prepare(sql);
    const trimmed = sql.trimStart().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA')) {
      return stmt.all(...params) as unknown as T[];
    }
    stmt.run(...params);
    return [];
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const res = fn();
      this.db.exec('COMMIT');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
