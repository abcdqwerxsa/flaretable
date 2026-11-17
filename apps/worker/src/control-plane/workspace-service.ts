import { generateId, type BaseSummary } from '@flaretable/shared';
import { ensureControlPlaneSchema } from './bootstrap.js';
import { AppError } from '../utils/response.js';

interface BaseRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  template_key: string;
  table_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublicFormRoute {
  shareToken: string;
  baseId: string;
  tableId: string;
  viewId: string;
  enabled: boolean;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

function mapBaseRow(row: BaseRow): BaseSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    templateKey: row.template_key,
    tableCount: Number(row.table_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBases(db: D1Database): Promise<BaseSummary[]> {
  await ensureControlPlaneSchema(db);
  const { results } = await db
    .prepare('SELECT * FROM bases ORDER BY updated_at DESC')
    .all<BaseRow>();
  return results.map(mapBaseRow);
}

export async function getBaseSummaryOrThrow(db: D1Database, baseId: string): Promise<BaseSummary> {
  await ensureControlPlaneSchema(db);
  const row = await db.prepare('SELECT * FROM bases WHERE id = ?').bind(baseId).first<BaseRow>();
  if (!row) {
    throw new AppError(404, 'BASE_NOT_FOUND', `未找到多维表格空间「${baseId}」`);
  }
  return mapBaseRow(row);
}

export async function insertBaseRecord(
  db: D1Database,
  input: {
    id: string;
    name: string;
    description: string;
    icon: string;
    templateKey: string;
    tableCount: number;
  },
): Promise<BaseSummary> {
  await ensureControlPlaneSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bases (id, name, description, icon, template_key, table_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.description,
      input.icon,
      input.templateKey,
      input.tableCount,
      now,
      now,
    )
    .run();

  return getBaseSummaryOrThrow(db, input.id);
}

export async function updateBaseTableCount(
  db: D1Database,
  baseId: string,
  tableCount: number,
): Promise<void> {
  await ensureControlPlaneSchema(db);
  await db
    .prepare('UPDATE bases SET table_count = ?, updated_at = ? WHERE id = ?')
    .bind(tableCount, new Date().toISOString(), baseId)
    .run();
}

export async function updateBaseRecord(
  db: D1Database,
  baseId: string,
  input: { name?: string; description?: string },
): Promise<BaseSummary> {
  const current = await getBaseSummaryOrThrow(db, baseId);
  const nextName = input.name?.trim() || current.name;
  const nextDesc = input.description ?? current.description;
  await db
    .prepare('UPDATE bases SET name = ?, description = ?, updated_at = ? WHERE id = ?')
    .bind(nextName, nextDesc, new Date().toISOString(), baseId)
    .run();
  return getBaseSummaryOrThrow(db, baseId);
}

export async function deleteBaseRecord(db: D1Database, baseId: string): Promise<void> {
  await ensureControlPlaneSchema(db);
  await db.prepare('DELETE FROM public_forms WHERE base_id = ?').bind(baseId).run();
  await db.prepare('DELETE FROM webhooks WHERE base_id = ?').bind(baseId).run();
  await db.prepare('DELETE FROM bases WHERE id = ?').bind(baseId).run();
}

export async function deletePublicFormByView(
  db: D1Database,
  baseId: string,
  viewId: string,
): Promise<void> {
  await ensureControlPlaneSchema(db);
  await db
    .prepare('DELETE FROM public_forms WHERE base_id = ? AND view_id = ?')
    .bind(baseId, viewId)
    .run();
}

export async function upsertPublicFormRoute(
  db: D1Database,
  input: {
    baseId: string;
    tableId: string;
    viewId: string;
    enabled: boolean;
    title: string;
    description: string;
  },
): Promise<PublicFormRoute> {
  await ensureControlPlaneSchema(db);
  const existing = await db
    .prepare('SELECT * FROM public_forms WHERE base_id = ? AND view_id = ?')
    .bind(input.baseId, input.viewId)
    .first<{
      share_token: string;
      base_id: string;
      table_id: string;
      view_id: string;
      enabled: number;
      title: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>();

  const now = new Date().toISOString();
  const shareToken = existing?.share_token ?? generateId('frm');

  if (existing) {
    await db
      .prepare(
        `UPDATE public_forms SET enabled = ?, title = ?, description = ?, updated_at = ? WHERE share_token = ?`,
      )
      .bind(input.enabled ? 1 : 0, input.title, input.description, now, shareToken)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO public_forms (share_token, base_id, table_id, view_id, enabled, title, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        shareToken,
        input.baseId,
        input.tableId,
        input.viewId,
        input.enabled ? 1 : 0,
        input.title,
        input.description,
        now,
        now,
      )
      .run();
  }

  return getPublicFormRouteOrThrow(db, shareToken);
}

export async function getPublicFormRouteOrThrow(
  db: D1Database,
  shareToken: string,
): Promise<PublicFormRoute> {
  await ensureControlPlaneSchema(db);
  const row = await db
    .prepare('SELECT * FROM public_forms WHERE share_token = ?')
    .bind(shareToken)
    .first<{
      share_token: string;
      base_id: string;
      table_id: string;
      view_id: string;
      enabled: number;
      title: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>();

  if (!row) {
    throw new AppError(404, 'PUBLIC_FORM_NOT_FOUND', '公开表单链接不存在或已失效');
  }

  return {
    shareToken: row.share_token,
    baseId: row.base_id,
    tableId: row.table_id,
    viewId: row.view_id,
    enabled: row.enabled === 1,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
