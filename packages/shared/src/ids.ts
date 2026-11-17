/**
 * 语义前缀 ID 生成器
 * @description 采用「前缀 + 36进制时间戳 + 加密随机串」格式，保证全局唯一性、可读性与按创建时间近似有序。
 */

export type EntityPrefix =
  | 'base'
  | 'tbl'
  | 'fld'
  | 'vw'
  | 'rec'
  | 'tok'
  | 'wh'
  | 'del'
  | 'evt'
  | 'att'
  | 'frm';

const CROCKFORD_CHARS = '0123456789abcdefghjkmnpqrstvwxyz';

/** 声明跨运行时标准 Web Crypto 接口，避免在 shared 包引入特定平台类型依赖 */
interface WebCryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
}

/**
 * 生成带语义前缀的唯一标识符
 * @param prefix 实体前缀，如 `base`、`tbl`、`fld`、`rec`
 * @returns 形如 `rec_01m9x7k3a8q2p5` 的字符串 ID
 */
export function generateId(prefix: EntityPrefix): string {
  const timePart = Date.now().toString(36).padStart(9, '0');
  const randomBytes = new Uint8Array(8);
  const webCrypto = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (webCrypto) {
    webCrypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let randomPart = '';
  for (let i = 0; i < randomBytes.length; i++) {
    const byte = randomBytes[i] ?? 0;
    randomPart += CROCKFORD_CHARS[byte % CROCKFORD_CHARS.length];
  }

  return `${prefix}_${timePart}${randomPart}`;
}
