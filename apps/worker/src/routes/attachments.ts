import {
  deleteAttachment,
  fetchAttachmentContent,
  getStorageQuota,
  uploadAttachment,
} from '../control-plane/storage-guard.js';
import { requireScope } from '../middleware/auth.js';
import { AppError } from '../utils/response.js';
import type { AppOpenAPI } from './bases.js';

export function registerAttachmentRoutes(app: AppOpenAPI): void {
  // 1. 查询当前全局 R2 配额与使用量
  app.get('/api/v1/storage/quota', requireScope('base:read', false), async (c) => {
    const quota = await getStorageQuota(c.env);
    return c.json({ ok: true, data: quota });
  });

  // 2. 上传附件至 R2（受 2GB 硬熔断配额守卫保护）
  app.post('/api/v1/bases/:baseId/attachments', requireScope('records:write'), async (c) => {
    const baseId = c.req.param('baseId') ?? '';
    const formData = await c.req.formData();
    const rawFile = formData.get('file') as unknown;
    const tableId = String(formData.get('tableId') ?? '');
    const recordId = String(formData.get('recordId') ?? '');

    const file = rawFile as { arrayBuffer?: () => Promise<ArrayBuffer>; name?: string; type?: string } | null;
    if (!file || typeof rawFile === 'string' || typeof file.arrayBuffer !== 'function') {
      throw new AppError(400, 'MISSING_FILE', '请使用 multipart/form-data 的 file 字段上传附件');
    }

    const bytes = await file.arrayBuffer();
    const result = await uploadAttachment(c.env, {
      baseId,
      tableId,
      recordId,
      filename: file.name || 'attachment.bin',
      mimeType: file.type || 'application/octet-stream',
      bytes,
    });

    return c.json({ ok: true, data: result }, 201);
  });

  // 3. 代理下载/预览 R2 附件内容
  app.get('/api/v1/attachments/:attachmentId/content', async (c) => {
    const attachmentId = c.req.param('attachmentId') ?? '';
    const { object, filename, mimeType } = await fetchAttachmentContent(c.env, attachmentId);

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(object.body, { headers });
  });

  // 4. 删除附件
  app.delete('/api/v1/attachments/:attachmentId', requireScope('records:write', false), async (c) => {
    const attachmentId = c.req.param('attachmentId') ?? '';
    await deleteAttachment(c.env, attachmentId);
    return c.json({ ok: true, data: { deleted: true } });
  });
}
