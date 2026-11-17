import type { FieldMeta } from '@flaretable/shared';

/**
 * 安全 AST 公式引擎（严禁使用 eval / new Function）
 * @description
 * 支持语法：
 * - 字段引用：`{字段名}` 或 `{fld_xxx}`
 * - 字面量：数字（123, 3.14）、字符串（"文本" / '文本'）、布尔（true / false）
 * - 运算符：`+`, `-`, `*`, `/`, `&`（字符串拼接）, `=`, `!=`, `>`, `>=`, `<`, `<=`
 * - 括号分组：`(...)`
 * - 内置函数：`IF(cond, a, b)`, `CONCAT(...)`, `UPPER(s)`, `LOWER(s)`, `LEN(s)`,
 *   `ROUND(n, digits)`, `ABS(n)`, `MIN(...)`, `MAX(...)`, `EMPTY(v)`, `COALESCE(...)`
 */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'field'; ref: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma' }
  | { kind: 'eof' };

export type FormulaNode =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'field'; ref: string }
  | { kind: 'unary'; op: '-'; arg: FormulaNode }
  | { kind: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; fn: string; args: FormulaNode[] };

/**
 * 词法分析器：将公式字符串拆解为 Token 序列
 */
export function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '{') {
      const closeIdx = expr.indexOf('}', i + 1);
      if (closeIdx === -1) {
        throw new Error('公式语法错误：缺少闭合的 "}"');
      }
      const ref = expr.slice(i + 1, closeIdx).trim();
      if (!ref) {
        throw new Error('公式语法错误：字段引用 {} 不能为空');
      }
      tokens.push({ kind: 'field', ref });
      i = closeIdx + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++;
      let closed = false;
      while (i < expr.length) {
        const cur = expr[i]!;
        if (cur === '\\' && i + 1 < expr.length) {
          str += expr[i + 1]!;
          i += 2;
          continue;
        }
        if (cur === quote) {
          closed = true;
          i++;
          break;
        }
        str += cur;
        i++;
      }
      if (!closed) {
        throw new Error('公式语法错误：字符串引号未闭合');
      }
      tokens.push({ kind: 'string', value: str });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i]!)) {
        numStr += expr[i]!;
        i++;
      }
      const num = Number(numStr);
      if (Number.isNaN(num)) {
        throw new Error(`公式语法错误：无效数字 "${numStr}"`);
      }
      tokens.push({ kind: 'number', value: num });
      continue;
    }

    const twoChar = expr.slice(i, i + 2);
    if (twoChar === '!=' || twoChar === '>=' || twoChar === '<=' || twoChar === '<>') {
      tokens.push({ kind: 'op', op: twoChar === '<>' ? '!=' : twoChar });
      i += 2;
      continue;
    }

    if ('+-*/&=><'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', value: ch });
      i++;
      continue;
    }

    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i]!)) {
        ident += expr[i]!;
        i++;
      }
      const upper = ident.toUpperCase();
      if (upper === 'TRUE') {
        tokens.push({ kind: 'boolean', value: true });
      } else if (upper === 'FALSE') {
        tokens.push({ kind: 'boolean', value: false });
      } else {
        tokens.push({ kind: 'ident', name: upper });
      }
      continue;
    }

    throw new Error(`公式语法错误：无法识别的字符 "${ch}"`);
  }

  tokens.push({ kind: 'eof' });
  return tokens;
}

/**
 * 递归下降语法分析器：构建公式 AST
 */
export function parseFormulaAst(expr: string): FormulaNode {
  const tokens = tokenizeFormula(expr);
  let pos = 0;

  const peek = (): Token => tokens[pos] ?? { kind: 'eof' };
  const consume = (): Token => {
    const tok = tokens[pos] ?? { kind: 'eof' };
    pos++;
    return tok;
  };

  function parseComparison(): FormulaNode {
    let left = parseConcat();
    while (peek().kind === 'op' && ['=', '!=', '>', '>=', '<', '<='].includes((peek() as { op: string }).op)) {
      const op = (consume() as { op: string }).op;
      const right = parseConcat();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function parseConcat(): FormulaNode {
    let left = parseAddSub();
    while (peek().kind === 'op' && (peek() as { op: string }).op === '&') {
      consume();
      const right = parseAddSub();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  }

  function parseAddSub(): FormulaNode {
    let left = parseMulDiv();
    while (peek().kind === 'op' && ['+', '-'].includes((peek() as { op: string }).op)) {
      const op = (consume() as { op: string }).op;
      const right = parseMulDiv();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function parseMulDiv(): FormulaNode {
    let left = parseUnary();
    while (peek().kind === 'op' && ['*', '/'].includes((peek() as { op: string }).op)) {
      const op = (consume() as { op: string }).op;
      const right = parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function parseUnary(): FormulaNode {
    if (peek().kind === 'op' && (peek() as { op: string }).op === '-') {
      consume();
      return { kind: 'unary', op: '-', arg: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): FormulaNode {
    const tok = consume();

    if (tok.kind === 'number' || tok.kind === 'string' || tok.kind === 'boolean') {
      return { kind: 'literal', value: tok.value };
    }

    if (tok.kind === 'field') {
      return { kind: 'field', ref: tok.ref };
    }

    if (tok.kind === 'paren' && tok.value === '(') {
      const inner = parseComparison();
      const closing = consume();
      if (closing.kind !== 'paren' || closing.value !== ')') {
        throw new Error('公式语法错误：缺少闭合括号 ")"');
      }
      return inner;
    }

    if (tok.kind === 'ident') {
      const next = consume();
      if (next.kind !== 'paren' || next.value !== '(') {
        throw new Error(`公式语法错误：函数 ${tok.name} 后需要 "("`);
      }
      const args: FormulaNode[] = [];
      if (!(peek().kind === 'paren' && (peek() as { value: string }).value === ')')) {
        while (true) {
          args.push(parseComparison());
          if (peek().kind === 'comma') {
            consume();
            continue;
          }
          break;
        }
      }
      const closing = consume();
      if (closing.kind !== 'paren' || closing.value !== ')') {
        throw new Error(`公式语法错误：函数 ${tok.name} 缺少闭合括号 ")"`);
      }
      return { kind: 'call', fn: tok.name, args };
    }

    throw new Error('公式语法错误：意外的表达式结尾或符号');
  }

  const ast = parseComparison();
  if (peek().kind !== 'eof') {
    throw new Error('公式语法错误：存在未解析的多余字符');
  }
  return ast;
}

/**
 * 提取公式 AST 引用的全部字段名或字段 ID
 */
export function extractFormulaDependencies(node: FormulaNode, acc = new Set<string>()): Set<string> {
  switch (node.kind) {
    case 'field':
      acc.add(node.ref);
      break;
    case 'unary':
      extractFormulaDependencies(node.arg, acc);
      break;
    case 'binary':
      extractFormulaDependencies(node.left, acc);
      extractFormulaDependencies(node.right, acc);
      break;
    case 'call':
      for (const arg of node.args) {
        extractFormulaDependencies(arg, acc);
      }
      break;
    default:
      break;
  }
  return acc;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * 求值公式 AST
 */
export function evaluateFormulaAst(
  node: FormulaNode,
  resolveRef: (ref: string) => unknown,
): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'field':
      return resolveRef(node.ref);

    case 'unary':
      return -toNum(evaluateFormulaAst(node.arg, resolveRef));

    case 'binary': {
      const left = evaluateFormulaAst(node.left, resolveRef);
      const right = evaluateFormulaAst(node.right, resolveRef);

      switch (node.op) {
        case '+':
          return toNum(left) + toNum(right);
        case '-':
          return toNum(left) - toNum(right);
        case '*':
          return toNum(left) * toNum(right);
        case '/': {
          const denom = toNum(right);
          return denom === 0 ? 0 : toNum(left) / denom;
        }
        case '&':
          return `${toText(left)}${toText(right)}`;
        case '=':
          return left === right || (toText(left) === toText(right) && left !== null && right !== null);
        case '!=':
          return !(left === right || (toText(left) === toText(right) && left !== null && right !== null));
        case '>':
          return toNum(left) > toNum(right);
        case '>=':
          return toNum(left) >= toNum(right);
        case '<':
          return toNum(left) < toNum(right);
        case '<=':
          return toNum(left) <= toNum(right);
        default:
          return null;
      }
    }

    case 'call': {
      const { fn, args } = node;
      switch (fn) {
        case 'IF': {
          const cond = args[0] ? Boolean(evaluateFormulaAst(args[0], resolveRef)) : false;
          if (cond) {
            return args[1] ? evaluateFormulaAst(args[1], resolveRef) : true;
          }
          return args[2] ? evaluateFormulaAst(args[2], resolveRef) : null;
        }
        case 'CONCAT':
          return args.map((a) => toText(evaluateFormulaAst(a, resolveRef))).join('');
        case 'UPPER':
          return toText(args[0] ? evaluateFormulaAst(args[0], resolveRef) : '').toUpperCase();
        case 'LOWER':
          return toText(args[0] ? evaluateFormulaAst(args[0], resolveRef) : '').toLowerCase();
        case 'LEN': {
          const val = args[0] ? evaluateFormulaAst(args[0], resolveRef) : '';
          return Array.isArray(val) ? val.length : toText(val).length;
        }
        case 'ROUND': {
          const num = toNum(args[0] ? evaluateFormulaAst(args[0], resolveRef) : 0);
          const digits = Math.max(0, Math.min(8, Math.floor(toNum(args[1] ? evaluateFormulaAst(args[1], resolveRef) : 0))));
          const factor = 10 ** digits;
          return Math.round(num * factor) / factor;
        }
        case 'ABS':
          return Math.abs(toNum(args[0] ? evaluateFormulaAst(args[0], resolveRef) : 0));
        case 'MIN': {
          const nums = args.map((a) => toNum(evaluateFormulaAst(a, resolveRef)));
          return nums.length ? Math.min(...nums) : 0;
        }
        case 'MAX': {
          const nums = args.map((a) => toNum(evaluateFormulaAst(a, resolveRef)));
          return nums.length ? Math.max(...nums) : 0;
        }
        case 'EMPTY':
          return isEmptyValue(args[0] ? evaluateFormulaAst(args[0], resolveRef) : null);
        case 'COALESCE': {
          for (const arg of args) {
            const val = evaluateFormulaAst(arg, resolveRef);
            if (!isEmptyValue(val)) return val;
          }
          return null;
        }
        default:
          return `#ERR:未知函数(${fn})`;
      }
    }
  }
}

/**
 * 批量对单张表的全部公式字段执行依赖拓扑求值，自动检测循环引用（返回 `#CYCLE!`）
 */
export function computeFormulaValuesForRow(
  fields: FieldMeta[],
  rowDataById: Record<string, unknown>,
): Record<string, unknown> {
  const formulaFields = fields.filter((f) => f.type === 'formula');
  if (formulaFields.length === 0) {
    return rowDataById;
  }

  const nextData = { ...rowDataById };
  const fieldByRef = new Map<string, FieldMeta>();
  for (const field of fields) {
    fieldByRef.set(field.id, field);
    fieldByRef.set(field.name, field);
  }

  // 解析 AST 与依赖图
  const astMap = new Map<string, FormulaNode>();
  const depsMap = new Map<string, Set<string>>();

  for (const ff of formulaFields) {
    const expr = ff.options.expression?.trim();
    if (!expr) {
      nextData[ff.id] = null;
      continue;
    }
    try {
      const ast = parseFormulaAst(expr);
      astMap.set(ff.id, ast);
      const rawDeps = extractFormulaDependencies(ast);
      const depFieldIds = new Set<string>();
      for (const ref of rawDeps) {
        const target = fieldByRef.get(ref);
        if (target) depFieldIds.add(target.id);
      }
      depsMap.set(ff.id, depFieldIds);
    } catch (err) {
      nextData[ff.id] = `#ERR:${err instanceof Error ? err.message : '语法错误'}`;
    }
  }

  // 带状态 DFS 实现拓扑求值与环检测
  const state = new Map<string, 'visiting' | 'done'>();

  const evaluateField = (fieldId: string): unknown => {
    const st = state.get(fieldId);
    if (st === 'visiting') {
      nextData[fieldId] = '#CYCLE!';
      return '#CYCLE!';
    }
    if (st === 'done') {
      return nextData[fieldId];
    }

    const ast = astMap.get(fieldId);
    if (!ast) {
      state.set(fieldId, 'done');
      return nextData[fieldId];
    }

    state.set(fieldId, 'visiting');

    // 若依赖另一个公式列且成环，直接捕获循环标记
    const deps = depsMap.get(fieldId);
    let hasCycle = false;
    if (deps) {
      for (const depId of deps) {
        if (astMap.has(depId)) {
          const depState = state.get(depId);
          if (depState === 'visiting') {
            hasCycle = true;
            break;
          }
          if (depState !== 'done') {
            const res = evaluateField(depId);
            if (res === '#CYCLE!') {
              hasCycle = true;
              break;
            }
          }
        }
      }
    }

    if (hasCycle) {
      nextData[fieldId] = '#CYCLE!';
      state.set(fieldId, 'done');
      return '#CYCLE!';
    }

    try {
      const value = evaluateFormulaAst(ast, (ref) => {
        const target = fieldByRef.get(ref);
        return target ? nextData[target.id] : null;
      });
      nextData[fieldId] = value;
    } catch {
      nextData[fieldId] = '#ERR';
    }

    state.set(fieldId, 'done');
    return nextData[fieldId];
  };

  for (const ff of formulaFields) {
    if (astMap.has(ff.id)) {
      evaluateField(ff.id);
    }
  }

  return nextData;
}
