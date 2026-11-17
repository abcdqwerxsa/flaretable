import { generateId, type AttachmentItem, type StorageQuota } from '@flaretable/shared';
import {
  DEFAULT_MAX_ATTACHMENT_BYTES,
  DEFAULT_MAX_R2_TOTAL_BYTES,
  parseQuotaNumber,
  type Env,
} from '../env.js';
import { ensureControlPlaneSchema } from './bootstrap.js';
import { AppError } from '../utils/response.js';

/**
 * 统计当前 R2 附件总用量与配额限制
 */
export async function getStorageQuota(env: Env): Promise<StorageQuota> {
  await ensureControlPlaneSchema(env.CONTROL_DB);
  const row = await env.CONTROL_DB.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS used_bytes, COUNT(*) AS cnt FROM attachments',
  ).first<{ used_bytes: number; cnt: number }>();

  const maxTotalBytes = parseQuotaNumber(env.MAX_R2_TOTAL_BYTES, DEFAULT_MAX_R2_TOTAL_BYTES);
  const maxFileBytes = parseQuotaNumber(env.MAX_ATTACHMENT_BYTES, DEFAULT_MAX_ATTACHMENT_BYTES);
  const usedBytes = Number(row?.used_bytes ?? 0);
  const objectCount = Number(row?.cnt ?? 0);

  return {
    usedBytes,
    maxTotalBytes,
    maxFileBytes,
    objectCount,
    usageRatio: Number((usedBytes / maxTotalBytes).toFixed(4)),
  };
}

/**
 * 校验并拦截超限上传（硬熔断守卫：确保绝不冲击 R2 10GB 免费层与云主机快照安全余量）
 */
export function assertQuotaAllowsUpload(
  quota: StorageQuota,
  incomingBytes: number,
): void {
  if (incomingBytes <= 0) {
    throw new AppError(400, 'EMPTY_FILE', '禁止上传空文件');
  }
  if (incomingBytes > quota.maxFileBytes) {
    const maxMb = (quota.maxFileBytes / (1024 * 1024)).toFixed(1);
    throw new AppError(
      413,
      'FILE_TOO_LARGE',
      `单个附件体积超过限制（最大允许 ${maxMb} MB）`,
    );
  }
  if (quota.usedBytes + incomingBytes > quota.maxTotalBytes) {
    const maxGb = (quota.maxTotalBytes / (1024 * 1024 * 1024)).toFixed(2);
    throw new AppError(
      413,
      'STORAGE_QUOTA_EXCEEDED',
      `已触发 R2 全局存储硬熔断保护（附件总上限 ${maxGb} GB，防止超出 Cloudflare 10GB 免费额度）`,
    );
  }
}

/**
 * 上传附件至 R2 并写入 D1 台账
 */
export async function uploadAttachment(
  env: Env,
  input: {
    baseId: string;
    tableId?: string;
    recordId?: string;
    filename: string;
    mimeType: string;
    bytes: ArrayBuffer;
  },
): Promise<{ attachment: AttachmentItem; quota: StorageQuota }> {
  const quota = await getStorageQuota(env);
  const sizeBytes = input.bytes.byteLength;
  assertQuotaAllowsUpload(quota, sizeBytes);

  const id = generateId('att');
  const safeName = input.filename.replace(/[^A-Za-z0-9._\-\u4e00-\u9fa5]/g, '_');
  const r2Key = `bases/${input.baseId}/${id}-${safeName}`;
  const now = new Date().toISOString();

  await env.ATTACHMENTS_BUCKET.put(r2Key, input.bytes, {
    httpMetadata: { contentType: input.mimeType || 'application/octet-stream' },
    customMetadata: { baseId: input.baseId, attachmentId: id },
  });

  await env.CONTROL_DB.prepare(
    `INSERT INTO attachments (id, base_id, table_id, record_id, r2_key, filename, mime_type, size_bytes, is_referenced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      id,
      input.baseId,
      input.tableId ?? '',
      input.recordId ?? '',
      r2Key,
      input.filename,
      input.mimeType || 'application/octet-stream',
      sizeBytes,
      now,
    )
    .run();

  const updatedQuota = await getStorageQuota(env);
  const attachment: AttachmentItem = {
    id,
    name: input.filename,
    mimeType: input.mimeType || 'application/octet-stream',
    size: sizeBytes,
    url: `/api/v1/attachments/${id}/content`,
  };

  return { attachment, quota: updatedQuota };
}

/**
 * 从 R2 读取附件二进制流
 */
export async function fetchAttachmentContent(
  env: Env,
  attachmentId: string,
): Promise<{ object: R2ObjectBody; filename: string; mimeType: string }> {
  await ensureControlPlaneSchema(env.CONTROL_DB);
  const meta = await env.CONTROL_DB.prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first<{ r2_key: string; filename: string; mime_type: string }>();

  if (!meta) {
    throw new AppError(404, 'ATTACHMENT_NOT_FOUND', '附件记录不存在');
  }

  const object = await env.ATTACHMENTS_BUCKET.get(meta.r2_key);
  if (!object) {
    throw new AppError(404, 'ATTACHMENT_OBJECT_MISSING', 'R2 存储对象缺失或已被清理');
  }

  return { object, filename: meta.filename, mimeType: meta.mime_type };
}

/**
 * 清理指定附件
 */
export async function deleteAttachment(env: Env, attachmentId: string): Promise<void> {
  await ensureControlPlaneSchema(env.CONTROL_DB);
  const meta = await env.CONTROL_DB.prepare('SELECT r2_key FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first<{ r2_key: string }>();
  if (!meta) return;

  await env.ATTACHMENTS_BUCKET.delete(meta.r2_key);
  await env.CONTROL_DB.prepare('DELETE FROM attachments WHERE id = ?').bind(attachmentId).run();
}
