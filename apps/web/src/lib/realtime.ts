import { useEffect, useRef, useState } from 'react';
import type { RealtimeServerMessage } from '@flaretable/shared';

export type WsConnectionStatus = 'connecting' | 'connected' | 'offline';

interface UseBaseRealtimeOptions {
  baseId: string | null;
  onRecordsChanged: (tableId: string) => void;
  onSchemaChanged: () => void;
}

/**
 * 订阅指定 Base 的 Hibernatable WebSocket 实时协同通道
 */
export function useBaseRealtime({
  baseId,
  onRecordsChanged,
  onSchemaChanged,
}: UseBaseRealtimeOptions) {
  const [status, setStatus] = useState<WsConnectionStatus>('offline');
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [lastActivity, setLastActivity] = useState<string>('');

  const recordsCbRef = useRef(onRecordsChanged);
  const schemaCbRef = useRef(onSchemaChanged);
  recordsCbRef.current = onRecordsChanged;
  schemaCbRef.current = onSchemaChanged;

  useEffect(() => {
    if (!baseId) {
      setStatus('offline');
      return;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let retryDelay = 1500;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?baseId=${encodeURIComponent(baseId)}`;

      ws = new WebSocket(url);

      ws.onopen = () => {
        if (disposed) return;
        setStatus('connected');
        retryDelay = 1500;
        pingTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(String(event.data)) as RealtimeServerMessage;
          if (msg.type === 'connected' || msg.type === 'presence') {
            setOnlineCount(msg.onlineCount);
          } else if (msg.type === 'records.changed') {
            setLastActivity(`${msg.actorLabel} 更新了数据`);
            recordsCbRef.current(msg.tableId);
          } else if (msg.type === 'schema.changed') {
            setLastActivity('表结构已实时同步');
            schemaCbRef.current();
          }
        } catch {
          // 忽略格式异常消息
        }
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (disposed) return;
        setStatus('offline');
        reconnectTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 15000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [baseId]);

  return { status, onlineCount, lastActivity };
}
