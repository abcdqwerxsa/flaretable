import {
  generateId,
  type AutomationEvent,
  type AutomationEventType,
} from '@flaretable/shared';
import { createWebhookSecret, signWebhookPayload } from '../utils/crypto.js';
import { ensureControlPlaneSchema } from './bootstrap.js';
import { AppError } from '../utils/response.js';

interface WebhookRow {
  id: string;
  base_id: string;
  name: string;
  target_url: string;
  secret: string;
  events_json: string;
  enabled: number;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  event_id: string;
  event_type: string;
  status_code: number | null;
  duration_ms: number;
  attempt: number;
  response_snippet: string;
  error_message: string;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  baseId: string;
  name: string;
  targetUrl: string;
  secret: string;
  events: AutomationEventType[];
  enabled: boolean;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  statusCode: number | null;
  durationMs: number;
  attempt: number;
  responseSnippet: string;
  errorMessage: string;
  createdAt: string;
}

function mapWebhookRow(row: WebhookRow): WebhookConfig {
  return {
    id: row.id,
    baseId: row.base_id,
    name: row.name,
    targetUrl: row.target_url,
    secret: row.secret,
    events: JSON.parse(row.events_json) as AutomationEventType[],
    enabled: row.enabled === 1,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createWebhook(
  db: D1Database,
  input: {
    baseId: string;
    name: string;
    targetUrl: string;
    events: AutomationEventType[];
  },
): Promise<WebhookConfig> {
  await ensureControlPlaneSchema(db);
  const id = generateId('wh');
  const secret = createWebhookSecret();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO webhooks (id, base_id, name, target_url, secret, events_json, enabled, failure_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    )
    .bind(
      id,
      input.baseId,
      input.name.trim(),
      input.targetUrl,
      secret,
      JSON.stringify(input.events),
      now,
      now,
    )
    .run();

  const row = await db.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first<WebhookRow>();
  return mapWebhookRow(row!);
}

export async function listWebhooks(db: D1Database, baseId?: string): Promise<WebhookConfig[]> {
  await ensureControlPlaneSchema(db);
  const query = baseId
    ? db.prepare('SELECT * FROM webhooks WHERE base_id = ? ORDER BY created_at DESC').bind(baseId)
    : db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC');
  const { results } = await query.all<WebhookRow>();
  return results.map(mapWebhookRow);
}

export async function toggleWebhook(db: D1Database, webhookId: string, enabled: boolean): Promise<WebhookConfig> {
  await ensureControlPlaneSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE webhooks SET enabled = ?, updated_at = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, now, webhookId)
    .run();
  const row = await db.prepare('SELECT * FROM webhooks WHERE id = ?').bind(webhookId).first<WebhookRow>();
  if (!row) {
    throw new AppError(404, 'WEBHOOK_NOT_FOUND', `未找到 Webhook「${webhookId}」`);
  }
  return mapWebhookRow(row);
}

export async function deleteWebhook(db: D1Database, webhookId: string): Promise<void> {
  await ensureControlPlaneSchema(db);
  await db.prepare('DELETE FROM webhook_deliveries WHERE webhook_id = ?').bind(webhookId).run();
  await db.prepare('DELETE FROM webhooks WHERE id = ?').bind(webhookId).run();
}

export async function listWebhookDeliveries(
  db: D1Database,
  webhookId: string,
  limit = 20,
): Promise<WebhookDeliveryLog[]> {
  await ensureControlPlaneSchema(db);
  const { results } = await db
    .prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(webhookId, limit)
    .all<DeliveryRow>();

  return results.map((r) => ({
    id: r.id,
    webhookId: r.webhook_id,
    eventId: r.event_id,
    eventType: r.event_type,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    attempt: r.attempt,
    responseSnippet: r.response_snippet,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));
}

/**
 * 向单个 Webhook 订阅端投递带 HMAC-SHA256 签名的事件，并记录投递审计日志
 */
export async function deliverSingleWebhook(
  db: D1Database,
  webhook: WebhookConfig,
  event: AutomationEvent,
  attempt = 1,
): Promise<WebhookDeliveryLog> {
  await ensureControlPlaneSchema(db);
  const deliveryId = generateId('del');
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({
    deliveryId,
    ...event,
  });
  const signature = await signWebhookPayload(webhook.secret, timestampSec, rawBody);

  const startedAt = Date.now();
  let statusCode: number | null = null;
  let responseSnippet = '';
  let errorMessage = '';
  let succeeded = false;

  try {
    const res = await fetch(webhook.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FlareTable-Webhook/1.0',
        'X-FlareTable-Event': event.eventType,
        'X-FlareTable-Delivery-Id': deliveryId,
        'X-FlareTable-Timestamp': timestampSec,
        'X-FlareTable-Signature-256': signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    statusCode = res.status;
    responseSnippet = (await res.text()).slice(0, 300);
    succeeded = res.ok;
    if (!res.ok) {
      errorMessage = `目标服务返回 HTTP ${res.status}`;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : '网络请求失败';
  }

  const durationMs = Date.now() - startedAt;
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO webhook_deliveries
       (id, webhook_id, event_id, event_type, status_code, duration_ms, attempt, response_snippet, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      deliveryId,
      webhook.id,
      event.eventId,
      event.eventType,
      statusCode,
      durationMs,
      attempt,
      responseSnippet,
      errorMessage,
      createdAt,
    )
    .run();

  if (succeeded) {
    await db
      .prepare('UPDATE webhooks SET failure_count = 0, updated_at = ? WHERE id = ?')
      .bind(createdAt, webhook.id)
      .run();
  } else {
    await db
      .prepare('UPDATE webhooks SET failure_count = failure_count + 1, updated_at = ? WHERE id = ?')
      .bind(createdAt, webhook.id)
      .run();
  }

  return {
    id: deliveryId,
    webhookId: webhook.id,
    eventId: event.eventId,
    eventType: event.eventType,
    statusCode,
    durationMs,
    attempt,
    responseSnippet,
    errorMessage,
    createdAt,
  };
}

/**
 * 分发一条自动化事件到全部匹配的激活 Webhook
 */
export async function dispatchAutomationEvent(db: D1Database, event: AutomationEvent): Promise<void> {
  const webhooks = await listWebhooks(db, event.baseId);
  const matching = webhooks.filter(
    (wh) => wh.enabled && (wh.events.includes(event.eventType) || event.eventType === 'webhook.test'),
  );

  for (const wh of matching) {
    const log = await deliverSingleWebhook(db, wh, event, 1);
    if (log.errorMessage) {
      // 将失败信息抛出以便 Queues 消费端自动进行退避重试
      throw new Error(`Webhook [${wh.name}] 投递失败: ${log.errorMessage}`);
    }
  }
}
