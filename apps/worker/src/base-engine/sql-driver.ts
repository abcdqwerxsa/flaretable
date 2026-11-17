/**
 * 同步 SQL 驱动抽象接口
 * @description 隔离底层存储引擎：生产环境绑定 Durable Object `storage.sql`，单测环境注入 Node 24 原生 `node:sqlite`。
 */

export type SqlParam = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface SyncSqlDriver {
  /**
   * 执行参数化 SQL 语句并返回全部结果行
   */
  exec<T extends SqlRow = SqlRow>(sql: string, ...params: SqlParam[]): T[];

  /**
   * 在同步原子事务内执行回调，任意异常自动回滚
   */
  transaction<T>(fn: () => T): T;
}

/**
 * Cloudflare Durable Object 内置 SQLite 存储适配器
 */
export class DoSqlDriver implements SyncSqlDriver {
  constructor(private readonly storage: DurableObjectStorage) {}

  exec<T extends SqlRow = SqlRow>(sql: string, ...params: SqlParam[]): T[] {
    const cursor = this.storage.sql.exec(sql, ...params);
    return cursor.toArray() as T[];
  }

  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }
}
