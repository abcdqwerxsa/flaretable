import type { Env } from '../env.js';
import { ensureControlPlaneSchema } from '../control-plane/bootstrap.js';

/**
 * 每日定时清理任务 (Cron: `0 3 * * *`)
 * @description
 * 1. 清理 30 天前的历史 Webhook 投递审计日志，防止 D1 体积无序膨胀；
 * 2. 回收标记为未引用（is_referenced = 0）的过期 R2 孤儿附件对象。
 */
export async function handleScheduledMaintenance(env: Env): Promise<{
  deletedDeliveryLogs: number;
  reclaimedAttachments: number;
}> {
  await ensureControlPlaneSchema(env.CONTROL_DB);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const logDelRes = await env.CONTROL_DB.prepare(
    'DELETE FROM webhook_deliveries WHERE created_at < ?',
  )
    .bind(thirtyDaysAgo)
    .run();

  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { results: orphanRows } = await env.CONTROL_DB.prepare(
    'SELECT id, r2_key FROM attachments WHERE is_referenced = 0 AND created_at < ? LIMIT 100',
  )
    .bind(oneDayAgo)
    .all<{ id: string; r2_key: string }>();

  let reclaimedAttachments = 0;
  for (const row of orphanRows) {
    await env.ATTACHMENTS_BUCKET.delete(row.r2_key);
    await env.CONTROL_DB.prepare('DELETE FROM attachments WHERE id = ?').bind(row.id).run();
    reclaimedAttachments++;
  }

  return {
    deletedDeliveryLogs: logDelRes.meta.changes ?? 0,
    reclaimedAttachments,
  };
}
