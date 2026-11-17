import type { Context, Next } from 'hono';
import type { ActorInfo, ApiScope } from '@flaretable/shared';
import type { Env } from '../env.js';
import { verifyBearerApiToken, type ApiTokenDescriptor } from '../control-plane/token-service.js';
import { AppError } from '../utils/response.js';

export interface AuthPrincipal {
  mode: 'admin' | 'api_token';
  actor: ActorInfo;
  token?: ApiTokenDescriptor;
}

export type AppVariables = {
  principal: AuthPrincipal;
};

/**
 * 统一鉴权解析函数（同时供 REST 中间件与 MCP 入口复用）
 */
export async function authenticateRequest(
  env: Env,
  headers: Headers,
): Promise<AuthPrincipal> {
  const authHeader = headers.get('Authorization') ?? '';

  if (authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7).trim();
    const token = await verifyBearerApiToken(env, rawToken);
    if (!token) {
      throw new AppError(401, 'INVALID_API_TOKEN', 'API Token 无效、已吊销或已过期');
    }
    return {
      mode: 'api_token',
      actor: { type: 'api_token', id: token.id, label: `Token:${token.name}` },
      token,
    };
  }

  // 工作台会话校验：若设置了 ADMIN_PASSCODE 则强制核对 X-Admin-Passcode，未设置则默认本地/Access托管可信
  if (env.ADMIN_PASSCODE) {
    const provided = headers.get('X-Admin-Passcode') ?? '';
    if (provided !== env.ADMIN_PASSCODE) {
      throw new AppError(401, 'ADMIN_AUTH_REQUIRED', '管理口令校验失败或缺少 Authorization Bearer Token');
    }
  }

  return {
    mode: 'admin',
    actor: { type: 'web', label: '工作台管理员' },
  };
}

/**
 * 校验当前身份是否具备操作目标 Scope 及 Base 的权限
 */
export function assertAuthorized(
  principal: AuthPrincipal,
  requiredScope: ApiScope,
  targetBaseId?: string,
): void {
  if (principal.mode === 'admin') {
    return;
  }

  const token = principal.token;
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', '未认证的访问请求');
  }

  if (!token.scopes.includes(requiredScope)) {
    throw new AppError(
      403,
      'INSUFFICIENT_SCOPE',
      `当前 API Token 缺少权限「${requiredScope}」`,
    );
  }

  if (targetBaseId && token.baseIds.length > 0 && !token.baseIds.includes(targetBaseId)) {
    throw new AppError(
      403,
      'BASE_ACCESS_DENIED',
      `当前 API Token 未被授权访问空间「${targetBaseId}」`,
    );
  }
}

/**
 * 生成 Hono 路由鉴权中间件
 */
export function requireScope(requiredScope: ApiScope, checkBaseParam = true) {
  return async (c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) => {
    const principal = await authenticateRequest(c.env, c.req.raw.headers);
    const baseId = checkBaseParam ? c.req.param('baseId') : undefined;
    assertAuthorized(principal, requiredScope, baseId);
    c.set('principal', principal);
    await next();
  };
}
