import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * 标准化应用业务异常类
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 将未知错误转换为规范 JSON 响应结构
 */
export function errorToJsonResponse(c: Context, err: unknown): Response {
  if (err instanceof AppError) {
    return c.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      err.status,
    );
  }

  const message = err instanceof Error ? err.message : '服务器内部异常';
  return c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    },
    500,
  );
}
