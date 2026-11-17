/**
 * 字典序分数索引（Fractional Indexing）生成器
 * @description 使表格行、字段列与视图的重排与任意位置插入只需单行 UPDATE，时间复杂度 O(1)。
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;

function charIndex(ch: string): number {
  const idx = ALPHABET.indexOf(ch);
  return idx === -1 ? 0 : idx;
}

/**
 * 生成位于 `prev` 与 `next` 之间的新排序字符串（严格满足 prev < result < next）
 * @param prev 前驱排序键（为空表示插入到头部）
 * @param next 后继排序键（为空表示追加到尾部）
 */
export function rankBetween(prev?: string | null, next?: string | null): string {
  const a = prev ?? '';
  const b = next ?? '';

  if (!a && !b) {
    return 'a0';
  }

  let prefix = '';
  let i = 0;

  while (true) {
    const lo = i < a.length ? charIndex(a[i]!) : 0;
    const hi = i < b.length ? charIndex(b[i]!) : BASE;

    if (lo === hi) {
      prefix += ALPHABET[lo]!;
      i++;
      continue;
    }

    if (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      return prefix + ALPHABET[mid]!;
    }

    // 相邻字符或已到达尾部时，借位向下延展一位中点字符
    prefix += ALPHABET[lo]!;
    if (!b && i >= a.length) {
      return prefix + ALPHABET[Math.floor(BASE / 2)]!;
    }
    i++;
    if (i > 32) {
      return `${a}V`;
    }
  }
}

/**
 * 在已有最大排序键后生成下一个追加键
 */
export function nextRankAfter(lastRank?: string | null): string {
  if (!lastRank) {
    return 'a0';
  }
  const head = lastRank[0] ?? 'a';
  // 快速步进常见尾部短键，避免字符串过快变长
  if (lastRank.length <= 4) {
    const lastCharIdx = charIndex(lastRank[lastRank.length - 1]!);
    if (lastCharIdx < BASE - 2) {
      return lastRank.slice(0, -1) + ALPHABET[lastCharIdx + 1]!;
    }
    if (lastRank.length === 2 && charIndex(head) < BASE - 2) {
      return ALPHABET[charIndex(head) + 1]! + '0';
    }
  }
  return rankBetween(lastRank, null);
}
