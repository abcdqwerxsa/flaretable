/**
 * 密码学工具模块（基于 Cloudflare Workers 标准 Web Crypto API）
 */

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 计算文本的 SHA-256 十六进制摘要（用于存储 API Token 哈希）
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * 生成指定字节数的十六进制高熵随机串
 */
export function randomHex(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * 生成供外部使用的 API Token 明文及脱敏前缀
 */
export function createRawApiToken(): { rawToken: string; prefix: string } {
  const rawToken = `ft_live_${randomHex(24)}`;
  const prefix = `${rawToken.slice(0, 14)}...${rawToken.slice(-4)}`;
  return { rawToken, prefix };
}

/**
 * 生成 Webhook HMAC 签名密钥
 */
export function createWebhookSecret(): string {
  return `whsec_${randomHex(24)}`;
}

/**
 * 为 Outgoing Webhook 计算 HMAC-SHA256 签名
 * @param secret Webhook 签名密钥
 * @param timestamp Unix 秒级时间戳字符串
 * @param rawBody 原始 JSON 请求体字符串
 * @returns 形如 `sha256=<hex>` 的签名头内容
 */
export async function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = textEncoder.encode(`${timestamp}.${rawBody}`);
  const signature = await crypto.subtle.sign('HMAC', key, message);
  return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

/**
 * 恒定时间校验 Webhook HMAC-SHA256 签名（防时序侧信道攻击）
 */
export async function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  receivedHeader: string,
): Promise<boolean> {
  const expected = await signWebhookPayload(secret, timestamp, rawBody);
  if (expected.length !== receivedHeader.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ receivedHeader.charCodeAt(i);
  }
  return diff === 0;
}
