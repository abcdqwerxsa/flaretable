import { useState } from 'react';
import {
  CHOICE_COLORS,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  type ChoiceColor,
  type FieldMeta,
  type FieldOptions,
  type FieldType,
  type SelectChoice,
  type TableWithSchema,
} from '@flaretable/shared';
import { Plus, Trash2, X } from 'lucide-react';
import { IOSCheckbox, IOSSheetGrabber } from './AppleUI.js';
import { getChoiceBadgeClass } from './BadgeUtils.js';

interface FieldModalProps {
  tables: TableWithSchema[];
  currentTable: TableWithSchema;
  editingField?: FieldMeta | null;
  onClose: () => void;
  onSubmit: (input: { name: string; type: FieldType; options: FieldOptions }) => Promise<void>;
}

export function FieldModal({
  tables,
  currentTable,
  editingField,
  onClose,
  onSubmit,
}: FieldModalProps) {
  const [name, setName] = useState(editingField?.name ?? '');
  const [type, setType] = useState<FieldType>(editingField?.type ?? 'text');
  const [choices, setChoices] = useState<SelectChoice[]>(
    editingField?.options.choices ?? [
      { id: 'opt_1', name: '待处理', color: 'slate' },
      { id: 'opt_2', name: '进行中', color: 'blue' },
      { id: 'opt_3', name: '已完成', color: 'emerald' },
    ],
  );
  const [precision, setPrecision] = useState<number>(editingField?.options.precision ?? 2);
  const [numberFormat, setNumberFormat] = useState<FieldOptions['numberFormat']>(
    editingField?.options.numberFormat ?? 'decimal',
  );
  const [targetTableId, setTargetTableId] = useState<string>(
    editingField?.options.targetTableId ?? tables.find((t) => t.id !== currentTable.id)?.id ?? currentTable.id,
  );
  const [allowMultiple, setAllowMultiple] = useState<boolean>(
    editingField?.options.allowMultiple ?? true,
  );

  const linkFields = currentTable.fields.filter((f) => f.type === 'link');
  const [linkFieldId, setLinkFieldId] = useState<string>(
    editingField?.options.linkFieldId ?? linkFields[0]?.id ?? '',
  );
  const selectedLinkField = linkFields.find((f) => f.id === linkFieldId);
  const lookupTargetTable = tables.find((t) => t.id === selectedLinkField?.options.targetTableId);
  const [targetFieldId, setTargetFieldId] = useState<string>(
    editingField?.options.targetFieldId ?? lookupTargetTable?.fields[0]?.id ?? '',
  );
  const [expression, setExpression] = useState<string>(
    editingField?.options.expression ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const options: FieldOptions = {};
      if (type === 'single_select' || type === 'multi_select') {
        options.choices = choices.filter((c) => c.name.trim());
      } else if (type === 'number') {
        options.precision = precision;
        options.numberFormat = numberFormat;
      } else if (type === 'link') {
        options.targetTableId = targetTableId;
        options.allowMultiple = allowMultiple;
      } else if (type === 'lookup') {
        options.linkFieldId = linkFieldId;
        options.targetFieldId = targetFieldId;
      } else if (type === 'formula') {
        options.expression = expression;
      }
      await onSubmit({ name: name.trim(), type, options });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存字段失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#F2F2F7] rounded-[24px] ios-popover w-full max-w-md overflow-hidden">
        <IOSSheetGrabber />
        <div className="px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-[15px] text-[#1D1D1F]">
            {editingField ? `编辑字段「${editingField.name}」` : '新增数据表字段'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center text-[#86868B]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="px-5 pb-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-[14px] bg-[#FF3B30]/10 text-[12px] text-[#C8231C]">
              {error}
            </div>
          )}

          <div className="bg-white rounded-[16px] divide-y divide-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="p-3.5">
              <label className="block text-[11px] font-semibold text-[#86868B] mb-1">
                字段名称
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：优先级 / AI 摘要 / 预估金额"
                className="w-full text-[14px] text-[#1D1D1F] placeholder:text-[#86868B]/60 focus:outline-none"
              />
            </div>

            {!editingField && (
              <div className="p-3.5">
                <label className="block text-[11px] font-semibold text-[#86868B] mb-1">
                  字段类型
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as FieldType)}
                  className="w-full text-[13px] font-medium text-[#1D1D1F] bg-transparent focus:outline-none"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {FIELD_TYPE_LABELS[ft]} ({ft})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 单选 / 多选选项配置 */}
          {(type === 'single_select' || type === 'multi_select') && (
            <div className="bg-white rounded-[16px] p-3.5 space-y-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[#86868B]">选项标签配置</label>
                <button
                  type="button"
                  onClick={() =>
                    setChoices([
                      ...choices,
                      {
                        id: `opt_${Date.now().toString(36)}`,
                        name: `选项 ${choices.length + 1}`,
                        color: CHOICE_COLORS[choices.length % CHOICE_COLORS.length]!,
                      },
                    ])
                  }
                  className="text-[12px] font-semibold text-[#007AFF] flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> 添加选项
                </button>
              </div>
              <div className="space-y-1.5">
                {choices.map((ch, idx) => (
                  <div key={ch.id} className="flex items-center gap-2">
                    <select
                      value={ch.color}
                      onChange={(e) => {
                        const next = [...choices];
                        next[idx] = { ...ch, color: e.target.value as ChoiceColor };
                        setChoices(next);
                      }}
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${getChoiceBadgeClass(ch.color)}`}
                    >
                      {CHOICE_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={ch.name}
                      onChange={(e) => {
                        const next = [...choices];
                        next[idx] = { ...ch, name: e.target.value };
                        setChoices(next);
                      }}
                      className="flex-1 text-[13px] bg-[#F2F2F7] rounded-[10px] px-2.5 py-1.5 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setChoices(choices.filter((_, i) => i !== idx))}
                      className="text-[#86868B] hover:text-[#FF3B30] p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 数字格式配置 */}
          {type === 'number' && (
            <div className="bg-white rounded-[16px] p-3.5 grid grid-cols-2 gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div>
                <label className="block text-[11px] font-semibold text-[#86868B] mb-1">展示格式</label>
                <select
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value as FieldOptions['numberFormat'])}
                  className="w-full px-2.5 py-1.5 text-[12px] bg-[#F2F2F7] rounded-[10px] focus:outline-none"
                >
                  <option value="decimal">普通数值</option>
                  <option value="currency_cny">人民币 (¥)</option>
                  <option value="currency_usd">美元 ($)</option>
                  <option value="percent">百分比 (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#86868B] mb-1">小数精度</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={precision}
                  onChange={(e) => setPrecision(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-[12px] bg-[#F2F2F7] rounded-[10px] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 关联记录配置 */}
          {type === 'link' && !editingField && (
            <div className="bg-white rounded-[16px] p-3.5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div>
                <label className="block text-[11px] font-semibold text-[#86868B] mb-1">
                  关联目标数据表
                </label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full px-2.5 py-2 text-[12px] bg-[#F2F2F7] rounded-[10px] focus:outline-none"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <IOSCheckbox
                checked={allowMultiple}
                onChange={setAllowMultiple}
                label="允许关联多条记录（自动双向同步）"
              />
            </div>
          )}

          {/* Lookup 查找引用配置 */}
          {type === 'lookup' && (
            <div className="bg-white rounded-[16px] p-3.5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {linkFields.length === 0 ? (
                <p className="text-[12px] text-[#B25E00]">
                  当前表尚未创建「关联记录 (link)」字段，请先创建一个关联列。
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#86868B] mb-1">
                      依据哪一个关联字段
                    </label>
                    <select
                      value={linkFieldId}
                      onChange={(e) => {
                        setLinkFieldId(e.target.value);
                        const lf = linkFields.find((f) => f.id === e.target.value);
                        const tt = tables.find((t) => t.id === lf?.options.targetTableId);
                        if (tt?.fields[0]) setTargetFieldId(tt.fields[0].id);
                      }}
                      className="w-full px-2.5 py-2 text-[12px] bg-[#F2F2F7] rounded-[10px]"
                    >
                      {linkFields.map((lf) => (
                        <option key={lf.id} value={lf.id}>
                          {lf.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#86868B] mb-1">
                      提取目标表的哪个字段
                    </label>
                    <select
                      value={targetFieldId}
                      onChange={(e) => setTargetFieldId(e.target.value)}
                      className="w-full px-2.5 py-2 text-[12px] bg-[#F2F2F7] rounded-[10px]"
                    >
                      {(lookupTargetTable?.fields ?? []).map((tf) => (
                        <option key={tf.id} value={tf.id}>
                          {tf.name} ({FIELD_TYPE_LABELS[tf.type]})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 公式编辑器 */}
          {type === 'formula' && (
            <div className="bg-white rounded-[16px] p-3.5 space-y-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <label className="block text-[11px] font-semibold text-[#86868B]">公式表达式</label>
              <textarea
                rows={3}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder='例如：ROUND({单价} * {数量}, 2) 或 IF({状态} = "已发布", "完成", "待办")'
                className="w-full px-3 py-2 text-[12px] font-mono bg-[#F2F2F7] rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <div className="text-[11px] text-[#86868B] space-y-1.5">
                <div>点击下方字段快捷插入引用：</div>
                <div className="flex flex-wrap gap-1.5">
                  {currentTable.fields
                    .filter((f) => f.id !== editingField?.id)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setExpression((prev) => `${prev}{${f.name}}`)}
                        className="px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-medium hover:bg-[#007AFF]/18"
                      >
                        {`{${f.name}}`}
                      </button>
                    ))}
                </div>
                <div className="text-[10px] text-[#86868B]/80">
                  内置函数：IF, CONCAT, UPPER, LOWER, LEN, ROUND, ABS, MIN, MAX, EMPTY, COALESCE
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-[#86868B] hover:text-[#1D1D1F] rounded-full"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || (type === 'lookup' && !targetFieldId)}
              className="px-5 py-2 text-[13px] font-semibold bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-full shadow-[0_2px_8px_rgba(0,122,255,0.28)] disabled:opacity-50 ios-press"
            >
              {saving ? '保存中...' : '保存字段'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
