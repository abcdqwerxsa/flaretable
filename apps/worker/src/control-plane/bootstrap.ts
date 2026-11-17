/**
 * D1 控制面幂等自检引导器
 * @description 与 `migrations/0001_control_plane.sql` 保持完全一致，保障本地开发与零迁移启动时的可用性。
 */

let bootstrapped = false;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'table',
    template_key TEXT NOT NULL DEFAULT 'blank',
    table_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bases_updated_at ON bases (updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS public_forms (
    share_token TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_public_forms_base_view ON public_forms (base_id, view_id)`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scopes_json TEXT NOT NULL,
    base_ids_json TEXT NOT NULL DEFAULT '[]',
    last_used_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash)`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_webhooks_base_enabled ON webhooks (base_id, enabled)`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status_code INTEGER,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    attempt INTEGER NOT NULL DEFAULT 1,
    response_snippet TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_created ON webhook_deliveries (webhook_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_created ON webhook_deliveries (created_at)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    table_id TEXT NOT NULL DEFAULT '',
    record_id TEXT NOT NULL DEFAULT '',
    r2_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    is_referenced INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_base ON attachments (base_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_gc ON attachments (is_referenced, created_at)`,
];

export async function ensureControlPlaneSchema(db: D1Database): Promise<void> {
  if (bootstrapped) return;
  const statements = DDL_STATEMENTS.map((sql) => db.prepare(sql));
  await db.batch(statements);
  bootstrapped = true;
}
