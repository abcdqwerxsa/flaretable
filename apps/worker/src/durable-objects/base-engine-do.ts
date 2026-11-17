import { DurableObject } from 'cloudflare:workers';
import type {
  ActorInfo,
  AutomationEvent,
  FieldKeyType,
  FieldOptions,
  FieldType,
  FilterGroup,
  RealtimeServerMessage,
  SortSpec,
  ViewConfig,
  ViewType,
} from '@flaretable/shared';
import type { Env } from '../env.js';
import { DoSqlDriver } from '../base-engine/sql-driver.js';
import { BaseService } from '../base-engine/base-service.js';
import { dispatchAutomationEvent } from '../control-plane/webhook-service.js';
import { AppError } from '../utils/response.js';

export type BaseEngineRpcPayload =
  | { op: 'initBlankBase'; baseId: string }
  | { op: 'getSchema'; baseId: string }
  | {
      op: 'createTable';
      baseId: string;
      input: {
        name: string;
        description?: string;
        primaryFieldName?: string;
        includeStarterFields?: boolean;
      };
    }
  | {
      op: 'updateTable';
      baseId: string;
      tableId: string;
      input: { name: string; description?: string };
    }
  | { op: 'deleteTable'; baseId: string; tableId: string }
  | {
      op: 'createField';
      baseId: string;
      tableId: string;
      input: { name: string; type: FieldType; options?: FieldOptions };
      actor: ActorInfo;
    }
  | {
      op: 'updateField';
      baseId: string;
      tableId: string;
      fieldId: string;
      input: { name?: string; options?: FieldOptions };
    }
  | { op: 'deleteField'; baseId: string; tableId: string; fieldId: string }
  | {
      op: 'createView';
      baseId: string;
      tableId: string;
      input: { name: string; type: ViewType; config?: ViewConfig };
    }
  | {
      op: 'updateView';
      baseId: string;
      tableId: string;
      viewId: string;
      input: { name?: string; config?: ViewConfig };
    }
  | { op: 'deleteView'; baseId: string; tableId: string; viewId: string }
  | {
      op: 'queryRecords';
      baseId: string;
      tableId: string;
      options?: {
        fieldKeyType?: FieldKeyType;
        filter?: FilterGroup;
        sorts?: SortSpec[];
        search?: string;
        limit?: number;
        offset?: number;
      };
    }
  | { op: 'getRecord'; baseId: string; tableId: string; recordId: string }
  | {
      op: 'createRecords';
      baseId: string;
      tableId: string;
      records: Array<{ fields: Record<string, unknown> }>;
      fieldKeyType: FieldKeyType;
      actor: ActorInfo;
    }
  | {
      op: 'updateRecords';
      baseId: string;
      tableId: string;
      records: Array<{ id: string; expectedVersion?: number; fields: Record<string, unknown> }>;
      fieldKeyType: FieldKeyType;
      actor: ActorInfo;
    }
  | {
      op: 'upsertRecords';
      baseId: string;
      tableId: string;
      matchField: string;
      records: Array<{ fields: Record<string, unknown> }>;
      fieldKeyType: FieldKeyType;
      actor: ActorInfo;
    }
  | {
      op: 'deleteRecords';
      baseId: string;
      tableId: string;
      recordIds: string[];
      actor: ActorInfo;
    };

/**
 * 每空间独占的 SQLite Durable Object 数据引擎与 Hibernatable WebSocket 协同房间
 */
export class BaseEngineDO extends DurableObject<Env> {
  private readonly sqlDriver: DoSqlDriver;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sqlDriver = new DoSqlDriver(ctx.storage);
  }

  private getService(baseId: string): BaseService {
    return new BaseService(baseId, this.sqlDriver);
  }

  /**
   * 广播实时消息至当前在线的所有 Hibernatable WebSocket 连接
   */
  private broadcast(message: RealtimeServerMessage): void {
    const raw = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(raw);
      } catch {
        // 忽略已断开待回收套接字
      }
    }
  }

  /**
   * 异步将领域事件推送至 Cloudflare Queues（失败时降级直投以保障一致性）
   */
  private async emitAutomationEvents(events: AutomationEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      await this.env.AUTOMATION_QUEUE.sendBatch(
        events.map((evt) => ({ body: evt })),
      );
    } catch {
      this.ctx.waitUntil(
        Promise.allSettled(events.map((evt) => dispatchAutomationEvent(this.env.CONTROL_DB, evt))),
      );
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. 处理 Hibernatable WebSocket 实时协同握手
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const baseId = url.searchParams.get('baseId') ?? 'unknown';
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ baseId, joinedAt: Date.now() });

      const onlineCount = this.ctx.getWebSockets().length;
      const welcome: RealtimeServerMessage = {
        type: 'connected',
        baseId,
        onlineCount,
      };
      server.send(JSON.stringify(welcome));

      // 广播更新全部在线客户端计数
      this.broadcast({ type: 'presence', onlineCount });
      return new Response(null, { status: 101, webSocket: client });
    }

    // 2. 处理内部结构化 RPC 调用
    if (request.method === 'POST' && url.pathname === '/rpc') {
      try {
        const payload = (await request.json()) as BaseEngineRpcPayload;
        const result = await this.handleRpc(payload);
        return Response.json({ ok: true, data: result });
      } catch (err) {
        if (err instanceof AppError) {
          return Response.json(
            {
              ok: false,
              error: { code: err.code, message: err.message, status: err.status, details: err.details },
            },
            { status: err.status },
          );
        }
        const message = err instanceof Error ? err.message : 'DO 内部执行异常';
        return Response.json(
          { ok: false, error: { code: 'DO_ERROR', message, status: 500 } },
          { status: 500 },
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleRpc(payload: BaseEngineRpcPayload): Promise<unknown> {
    const service = this.getService(payload.baseId);
    const now = new Date().toISOString();

    switch (payload.op) {
      case 'initBlankBase': {
        return service.initBlankBase();
      }

      case 'getSchema':
        return service.getFullSchema();

      case 'createTable': {
        const table = service.createTable(payload.input);
        this.broadcast({
          type: 'schema.changed',
          tableId: table.id,
          action: 'table_created',
          timestamp: now,
        });
        return table;
      }

      case 'updateTable': {
        const table = service.updateTable(payload.tableId, payload.input);
        this.broadcast({
          type: 'schema.changed',
          tableId: table.id,
          action: 'table_updated',
          timestamp: now,
        });
        return table;
      }

      case 'deleteTable': {
        service.deleteTable(payload.tableId);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'table_deleted',
          timestamp: now,
        });
        return { deleted: true };
      }

      case 'createField': {
        const res = service.createField(payload.tableId, payload.input, payload.actor);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'field_created',
          timestamp: now,
        });
        await this.emitAutomationEvents(res.events);
        return res.data;
      }

      case 'updateField': {
        const field = service.updateField(payload.tableId, payload.fieldId, payload.input);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'field_updated',
          timestamp: now,
        });
        return field;
      }

      case 'deleteField': {
        service.deleteField(payload.tableId, payload.fieldId);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'field_deleted',
          timestamp: now,
        });
        return { deleted: true };
      }

      case 'createView': {
        const view = service.createView(payload.tableId, payload.input);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'view_updated',
          timestamp: now,
        });
        return view;
      }

      case 'updateView': {
        const view = service.updateView(payload.tableId, payload.viewId, payload.input);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'view_updated',
          timestamp: now,
        });
        return view;
      }

      case 'deleteView': {
        service.deleteView(payload.tableId, payload.viewId);
        this.broadcast({
          type: 'schema.changed',
          tableId: payload.tableId,
          action: 'view_deleted',
          timestamp: now,
        });
        return { deleted: true };
      }

      case 'queryRecords':
        return service.queryRecords(payload.tableId, payload.options);

      case 'getRecord':
        return service.getRecordOrThrow(payload.tableId, payload.recordId);

      case 'createRecords': {
        const res = service.createRecords(
          payload.tableId,
          payload.records,
          payload.fieldKeyType,
          payload.actor,
        );
        this.broadcast({
          type: 'records.changed',
          tableId: payload.tableId,
          action: 'created',
          recordIds: res.data.map((r) => r.id),
          actorLabel: payload.actor.label,
          timestamp: now,
        });
        await this.emitAutomationEvents(res.events);
        return res.data;
      }

      case 'updateRecords': {
        const res = service.updateRecords(
          payload.tableId,
          payload.records,
          payload.fieldKeyType,
          payload.actor,
        );
        this.broadcast({
          type: 'records.changed',
          tableId: payload.tableId,
          action: 'updated',
          recordIds: res.data.map((r) => r.id),
          actorLabel: payload.actor.label,
          timestamp: now,
        });
        await this.emitAutomationEvents(res.events);
        return res.data;
      }

      case 'upsertRecords': {
        const res = service.upsertRecords(
          payload.tableId,
          payload.matchField,
          payload.records,
          payload.fieldKeyType,
          payload.actor,
        );
        this.broadcast({
          type: 'records.changed',
          tableId: payload.tableId,
          action: 'upserted',
          recordIds: res.data.records.map((entry) => entry.record.id),
          actorLabel: payload.actor.label,
          timestamp: now,
        });
        await this.emitAutomationEvents(res.events);
        return res.data;
      }

      case 'deleteRecords': {
        const res = service.deleteRecords(payload.tableId, payload.recordIds, payload.actor);
        if (res.data.deletedIds.length > 0) {
          this.broadcast({
            type: 'records.changed',
            tableId: payload.tableId,
            action: 'deleted',
            recordIds: res.data.deletedIds,
            actorLabel: payload.actor.label,
            timestamp: now,
          });
          await this.emitAutomationEvents(res.events);
        }
        return res.data;
      }
    }
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === 'ping') {
        const pong: RealtimeServerMessage = {
          type: 'pong',
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(pong));
      }
    } catch {
      // 忽略无效心跳格式
    }
  }

  override async webSocketClose(): Promise<void> {
    const onlineCount = Math.max(0, this.ctx.getWebSockets().length - 1);
    this.broadcast({ type: 'presence', onlineCount });
  }

  override async webSocketError(): Promise<void> {
    const onlineCount = this.ctx.getWebSockets().length;
    this.broadcast({ type: 'presence', onlineCount });
  }
}
