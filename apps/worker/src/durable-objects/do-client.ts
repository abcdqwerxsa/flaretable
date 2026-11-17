import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env.js';
import type { BaseEngineRpcPayload } from './base-engine-do.js';
import { AppError } from '../utils/response.js';

/**
 * 调用指定 Base 对应的 Durable Object 内部 RPC 方法，并将业务异常透明还原为 AppError
 */
export async function callBaseEngine<T>(env: Env, payload: BaseEngineRpcPayload): Promise<T> {
  const id = env.BASE_ENGINE.idFromName(payload.baseId);
  const stub = env.BASE_ENGINE.get(id);

  const response = await stub.fetch('http://do.internal/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; status?: number; details?: unknown } };

  if (!body.ok) {
    const status = (body.error.status ?? response.status ?? 500) as ContentfulStatusCode;
    throw new AppError(status, body.error.code, body.error.message, body.error.details);
  }

  return body.data;
}
