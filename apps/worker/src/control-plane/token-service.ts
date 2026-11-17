import { generateId, type ApiScope } from '@flaretable/shared';
import type { Env } from '../env.js';
import { createRawApiToken, sha256Hex } from '../utils/crypto.js';
import { ensureControlPlaneSchema } from './bootstrap.js';
import { AppError } from '../utils/response.js';

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes_json: string;
  base_ids_json: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiTokenDescriptor {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiScope[];
  baseIds: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function mapTokenRow(row: TokenRow): ApiTokenDescriptor {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: JSON.parse(row.scopes_json) as ApiScope[],
    baseIds: JSON.parse(row.base_ids_json) as string[],
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function kvCacheKey(tokenHash: string): string {
  return `tok:${tokenHash}`;
}

export async function createApiToken(
  env: Env,
  input: {
    name: string;
    scopes: ApiScope[];
    baseIds?: string[];
    expiresInDays?: number;
  },
): Promise<{ token: ApiTokenDescriptor; plainTextToken: string }> {
  await ensureControlPlaneSchema(env.CONTROL_DB);
  const id = generateId('tok');
  const { rawToken, prefix } = createRawApiToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 86400 * 1000).toISOString()
    : null;

  await env.CONTROL_DB.prepare(
    `INSERT INTO api_tokens (id, name, token_prefix, token_hash, scopes_json, base_ids_json, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.name.trim(),
      prefix,
      tokenHash,
      JSON.stringify(input.scopes),
      JSON.stringify(input.baseIds ?? []),
      expiresAt,
      createdAt,
    )
    .run();

  const row = await env.CONTROL_DB.prepare('SELECT * FROM api_tokens WHERE id = ?')
    .bind(id)
    .first<TokenRow>();
  const descriptor = mapTokenRow(row!);

  // 预热写入 Workers KV 缓存
  await env.TOKEN_CACHE_KV.put(kvCacheKey(tokenHash), JSON.stringify(descriptor), {
    expirationTtl: 300,
  });

  return { token: descriptor, plainTextToken: rawToken };
}

export async function listApiTokens(db: D1Database): Promise<ApiTokenDescriptor[]> {
  await ensureControlPlaneSchema(db);
  const { results } = await db
    .prepare('SELECT * FROM api_tokens ORDER BY created_at DESC')
    .all<TokenRow>();
  return results.map(mapTokenRow);
}

export async function revokeApiToken(env: Env, tokenId: string): Promise<void> {
  await ensureControlPlaneSchema(env.CONTROL_DB);
  const row = await env.CONTROL_DB.prepare('SELECT * FROM api_tokens WHERE id = ?')
    .bind(tokenId)
    .first<TokenRow>();
  if (!row) {
    throw new AppError(404, 'TOKEN_NOT_FOUND', `未找到 API Token「${tokenId}」`);
  }

  const now = new Date().toISOString();
  await env.CONTROL_DB.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?')
    .bind(now, tokenId)
    .run();

  // 主动驱逐 KV 边缘缓存，保障秒级吊销生效
  await env.TOKEN_CACHE_KV.delete(kvCacheKey(row.token_hash));
}

/**
 * 校验外部传入的 Bearer API Token（KV 优先，未命中回源 D1）
 */
export async function verifyBearerApiToken(
  env: Env,
  rawToken: string,
): Promise<ApiTokenDescriptor | null> {
  if (!rawToken.startsWith('ft_live_')) {
    return null;
  }

  const tokenHash = await sha256Hex(rawToken);
  const cacheKey = kvCacheKey(tokenHash);

  const cached = await env.TOKEN_CACHE_KV.get(cacheKey);
  let descriptor: ApiTokenDescriptor | null = null;

  if (cached) {
    descriptor = JSON.parse(cached) as ApiTokenDescriptor;
  } else {
    await ensureControlPlaneSchema(env.CONTROL_DB);
    const row = await env.CONTROL_DB.prepare('SELECT * FROM api_tokens WHERE token_hash = ?')
      .bind(tokenHash)
      .first<TokenRow>();
    if (!row) {
      return null;
    }
    descriptor = mapTokenRow(row);
    if (!descriptor.revokedAt) {
      await env.TOKEN_CACHE_KV.put(cacheKey, JSON.stringify(descriptor), { expirationTtl: 300 });
    }
  }

  if (descriptor.revokedAt) {
    return null;
  }

  if (descriptor.expiresAt && Date.parse(descriptor.expiresAt) <= Date.now()) {
    return null;
  }

  // 异步刷新最近使用时间（不阻塞边缘鉴权主路径）
  env.CONTROL_DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), descriptor.id)
    .run()
    .catch(() => {});

  return descriptor;
}
