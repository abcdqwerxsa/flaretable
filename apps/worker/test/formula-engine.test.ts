import { describe, expect, it } from 'vitest';
import type { FieldMeta } from '@flaretable/shared';
import { computeFormulaValuesForRow, parseFormulaAst } from '../src/base-engine/formula-engine.js';

function makeField(partial: Partial<FieldMeta> & { id: string; name: string; type: FieldMeta['type'] }): FieldMeta {
  return {
    tableId: 'tbl_test',
    options: {},
    isPrimary: false,
    isComputed: partial.type === 'formula' || partial.type === 'lookup',
    rank: 'a0',
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...partial,
  };
}

describe('安全 AST 公式引擎 (formula-engine)', () => {
  it('支持四则运算、字符串连接、内置函数与中文列名引用', () => {
    const fields: FieldMeta[] = [
      makeField({ id: 'fld_price', name: '单价', type: 'number' }),
      makeField({ id: 'fld_qty', name: '数量', type: 'number' }),
      makeField({ id: 'fld_vip', name: '会员', type: 'checkbox' }),
      makeField({
        id: 'fld_total',
        name: '折后总额',
        type: 'formula',
        options: { expression: 'ROUND(IF({会员}, {单价} * {数量} * 0.85, {单价} * {数量}), 2)' },
      }),
      makeField({
        id: 'fld_summary',
        name: '结算说明',
        type: 'formula',
        options: { expression: 'CONCAT("实付:", {折后总额}, "元")' },
      }),
    ];

    const res1 = computeFormulaValuesForRow(fields, {
      fld_price: 99.5,
      fld_qty: 3,
      fld_vip: true,
    });
    expect(res1.fld_total).toBe(253.73);
    expect(res1.fld_summary).toBe('实付:253.73元');

    const res2 = computeFormulaValuesForRow(fields, {
      fld_price: 100,
      fld_qty: 2,
      fld_vip: false,
    });
    expect(res2.fld_total).toBe(200);
    expect(res2.fld_summary).toBe('实付:200元');
  });

  it('能正确处理 COALESCE、EMPTY、UPPER、LEN 与除零保护', () => {
    const fields: FieldMeta[] = [
      makeField({ id: 'fld_a', name: '首选', type: 'text' }),
      makeField({ id: 'fld_b', name: '备选', type: 'text' }),
      makeField({
        id: 'fld_out',
        name: '输出',
        type: 'formula',
        options: { expression: 'UPPER(COALESCE({首选}, {备选}, "default")) & ":" & LEN({备选})' },
      }),
      makeField({
        id: 'fld_div',
        name: '安全除法',
        type: 'formula',
        options: { expression: '100 / 0 + MAX(2, 9, 4)' },
      }),
    ];

    const out = computeFormulaValuesForRow(fields, { fld_a: null, fld_b: 'flare' });
    expect(out.fld_out).toBe('FLARE:5');
    expect(out.fld_div).toBe(9);
  });

  it('能自动检测公式间的循环依赖并返回 #CYCLE! 标记而不崩溃', () => {
    const fields: FieldMeta[] = [
      makeField({
        id: 'fld_f1',
        name: '公式A',
        type: 'formula',
        options: { expression: '{公式B} + 1' },
      }),
      makeField({
        id: 'fld_f2',
        name: '公式B',
        type: 'formula',
        options: { expression: '{公式A} + 1' },
      }),
    ];

    const out = computeFormulaValuesForRow(fields, {});
    expect(out.fld_f1).toBe('#CYCLE!');
    expect(out.fld_f2).toBe('#CYCLE!');
  });

  it('拒绝非法未闭合括号或字符串语法', () => {
    expect(() => parseFormulaAst('IF({A} = 1, "ok"')).toThrow();
    expect(() => parseFormulaAst('{A} + "unclosed')).toThrow();
  });
});
