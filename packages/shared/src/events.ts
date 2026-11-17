import { z } from 'zod';

/**
 * 自动化与审计事件类型
 */
export const AUTOMATION_EVENT_TYPES = [
  'record.created',
  'record.updated',
  'record.deleted',
  'field.created',
  'form.submitted',
  'webhook.test',
] as const;

export type AutomationEventType = (typeof AUTOMATION_EVENT_TYPES)[number];

export const AutomationEventTypeSchema = z.enum(AUTOMATION_EVENT_TYPES);

/**
 * 写入操作来源上下文
 */
export const ActorInfoSchema = z.object({
  type: z.enum(['web', 'api_token', 'mcp', 'public_form', 'system']),
  id: z.string().optional(),
  label: z.string(),
});

export type ActorInfo = z.infer<typeof ActorInfoSchema>;

/**
 * 推送至 Cloudflare Queues 与 Outgoing Webhook 的标准事件负载
 */
export const AutomationEventSchema = z.object({
  eventId: z.string(),
  eventType: AutomationEventTypeSchema,
  timestamp: z.string(),
  baseId: z.string(),
  tableId: z.string(),
  actor: ActorInfoSchema,
  data: z.record(z.string(), z.unknown()),
});

export type AutomationEvent = z.infer<typeof AutomationEventSchema>;

/**
 * Durable Object Hibernatable WebSocket 协同广播消息
 */
export type RealtimeServerMessage =
  | {
      type: 'connected';
      baseId: string;
      onlineCount: number;
    }
  | {
      type: 'presence';
      onlineCount: number;
    }
  | {
      type: 'records.changed';
      tableId: string;
      action: 'created' | 'updated' | 'upserted' | 'deleted';
      recordIds: string[];
      actorLabel: string;
      timestamp: string;
    }
  | {
      type: 'schema.changed';
      tableId: string;
      action:
        | 'table_created'
        | 'table_updated'
        | 'table_deleted'
        | 'field_created'
        | 'field_updated'
        | 'field_deleted'
        | 'view_updated'
        | 'view_deleted';
      timestamp: string;
    }
  | {
      type: 'pong';
      timestamp: string;
    };
