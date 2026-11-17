import type { AutomationEvent } from '@flaretable/shared';

/**
 * Cloudflare Worker 运行时环境变量与绑定契约
 */
export interface Env {
  /** 前端静态资源资产绑定 */
  ASSETS: Fetcher;
  /** 全局控制面 D1 数据库 */
  CONTROL_DB: D1Database;
  /** 每空间独立的 SQLite Durable Object 引擎 */
  BASE_ENGINE: DurableObjectNamespace;
  /** API Token 边缘鉴权缓存 */
  TOKEN_CACHE_KV: KVNamespace;
  /** R2 附件对象存储桶 */
  ATTACHMENTS_BUCKET: R2Bucket;
  /** 异步自动化事件队列 */
  AUTOMATION_QUEUE: Queue<AutomationEvent>;

  /** 运行环境标识 */
  ENVIRONMENT?: string;
  /** 可选管理端访问口令（配置后访问管理后台需校验口令或 Bearer Token） */
  ADMIN_PASSCODE?: string;
  /** R2 附件总存储硬熔断上限（字节），默认 2 GiB 以内保护 10GB 免费层 */
  MAX_R2_TOTAL_BYTES?: string;
  /** 单附件最大允许体积（字节），默认 25 MiB */
  MAX_ATTACHMENT_BYTES?: string;
}

/** 默认 R2 总存储硬上限：2 GiB */
export const DEFAULT_MAX_R2_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/** 默认单文件上传上限：25 MiB */
export const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * 解析整型配额配置，提供安全兜底值
 */
export function parseQuotaNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
