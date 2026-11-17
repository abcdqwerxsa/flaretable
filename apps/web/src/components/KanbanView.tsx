import { useState } from 'react';
import type { FieldMeta, RecordItem, TableWithSchema, ViewMeta } from '@flaretable/shared';
import { Plus } from 'lucide-react';
import { getChoiceBadgeClass } from './BadgeUtils.js';

interface KanbanViewProps {
  table: TableWithSchema;
  view: ViewMeta;
  records: RecordItem[];
  linkedRecordMap: Record<string, string>;
  onPatchRecord: (recordId: string, fields: Record<string, unknown>) => Promise<void>;
  onOpenRecord: (record: RecordItem) => void;
  onCreateRecordWithDefaults: (defaults: Record<string, unknown>) => Promise<void>;
  onUpdateViewGroupField: (fieldId: string) => Promise<void>;
}

function formatReadableValue(
  field: FieldMeta,
  val: unknown,
  linkedRecordMap: Record<string, string>,
): string {
  if (field.type === 'link' && Array.isArray(val)) {
    return val.map((id) => linkedRecordMap[String(id)] ?? String(id)).join('、');
  }
  if (Array.isArray(val)) {
    return val.join(', ');
  }
  return String(val);
}

export function KanbanView({
  table,
  view,
  records,
  linkedRecordMap,
  onPatchRecord,
  onOpenRecord,
  onCreateRecordWithDefaults,
  onUpdateViewGroupField,
}: KanbanViewProps) {
  const selectFields = table.fields.filter((f) => f.type === 'single_select');
  const [selectedFieldId, setSelectedFieldId] = useState<string>(
    view.config.groupByFieldId ?? selectFields[0]?.id ?? '',
  );

  const groupField: FieldMeta | undefined =
    selectFields.find((f) => f.id === selectedFieldId) ?? selectFields[0];

  if (!groupField) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F2F2F7]/50 p-8 text-[13px] text-[#86868B]">
        当前数据表暂无「单选 (single_select)」字段，请先新增一个状态或阶段单选列后再使用看板视图。
      </div>
    );
  }

  const choices = groupField.options.choices ?? [];
  const columns = [
    ...choices.map((c) => ({ key: c.name, label: c.name, color: c.color })),
    { key: '__unassigned__', label: '未分类', color: 'slate' as const },
  ];

  const grouped = new Map<string, RecordItem[]>();
  for (const col of columns) grouped.set(col.key, []);

  for (const rec of records) {
    const val = rec.fields[groupField.id];
    const key = typeof val === 'string' && grouped.has(val) ? val : '__unassigned__';
    grouped.get(key)!.push(rec);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F2F2F7]/65">
      {/* 看板分组字段选择器 */}
      <div className="px-4 py-2 bg-white/80 backdrop-blur-md border-b border-black/[0.05] flex items-center gap-2.5 text-[12px] shrink-0">
        <span className="text-[#86868B] font-medium">分组列</span>
        <select
          value={groupField.id}
          onChange={(e) => {
            setSelectedFieldId(e.target.value);
            void onUpdateViewGroupField(e.target.value);
          }}
          className="rounded-full px-3 py-1 bg-[#767680]/[0.09] text-[#1D1D1F] font-semibold focus:outline-none"
        >
          {selectFields.map((sf) => (
            <option key={sf.id} value={sf.id}>
              {sf.name}
            </option>
          ))}
        </select>
      </div>

      {/* 横向看板泳道 */}
      <div className="flex-1 overflow-x-auto p-4 flex items-start gap-3.5">
        {columns.map((col) => {
          const items = grouped.get(col.key) ?? [];
          if (col.key === '__unassigned__' && items.length === 0) return null;

          return (
            <div
              key={col.key}
              className="w-[292px] shrink-0 bg-white/60 backdrop-blur-xl rounded-[18px] border border-black/[0.06] flex flex-col max-h-full"
            >
              <div className="px-3.5 py-3 flex items-center justify-between">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ${getChoiceBadgeClass(col.color)}`}
                >
                  {col.label}
                </span>
                <span className="text-[11px] font-mono font-semibold text-[#86868B] bg-black/[0.05] px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>

              <div className="px-2.5 pb-2 space-y-2.5 overflow-y-auto flex-1">
                {items.map((rec) => {
                  const title = String(rec.fields[table.primaryFieldId] ?? '未命名记录');
                  const extraFields = table.fields
                    .filter((f) => f.id !== table.primaryFieldId && f.id !== groupField.id)
                    .slice(0, 3);

                  return (
                    <div
                      key={rec.id}
                      onClick={() => onOpenRecord(rec)}
                      className="bg-white rounded-[14px] p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_18px_rgba(0,122,255,0.12),0_0_0_1px_rgba(0,122,255,0.35)] cursor-pointer transition-all space-y-2.5 ios-press"
                    >
                      <div className="text-[13px] font-semibold text-[#1D1D1F] leading-snug line-clamp-2">
                        {title}
                      </div>

                      <div className="space-y-1.5">
                        {extraFields.map((ef) => {
                          const v = rec.fields[ef.id];
                          if (v === null || v === undefined || v === '') return null;
                          if (Array.isArray(v) && v.length === 0) return null;
                          return (
                            <div key={ef.id} className="flex items-center justify-between text-[11px] gap-2">
                              <span className="text-[#86868B] shrink-0">{ef.name}</span>
                              {ef.type === 'link' ? (
                                <span className="px-2 py-0.5 rounded-full bg-[#5856D6]/12 text-[#4543B5] font-semibold truncate">
                                  {formatReadableValue(ef, v, linkedRecordMap)}
                                </span>
                              ) : (
                                <span className="text-[#1D1D1F] truncate font-medium">
                                  {formatReadableValue(ef, v, linkedRecordMap)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 快捷流转阶段选择器 */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pt-2 border-t border-black/[0.05] flex items-center justify-between"
                      >
                        <span className="text-[10px] font-medium text-[#86868B]">切换阶段</span>
                        <select
                          value={col.key === '__unassigned__' ? '' : col.key}
                          onChange={(e) =>
                            void onPatchRecord(rec.id, {
                              [groupField.id]: e.target.value || null,
                            })
                          }
                          className="text-[11px] font-medium rounded-full px-2.5 py-0.5 bg-[#767680]/[0.09] text-[#1D1D1F] focus:outline-none"
                        >
                          <option value="">未分类</option>
                          {choices.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {col.key !== '__unassigned__' && (
                <button
                  type="button"
                  onClick={() =>
                    void onCreateRecordWithDefaults({
                      [table.primaryFieldId]: '新卡片记录',
                      [groupField.id]: col.key,
                    })
                  }
                  className="m-2.5 py-2 rounded-[12px] text-[12px] font-semibold text-[#007AFF] hover:bg-white/80 flex items-center justify-center gap-1 transition-colors ios-press"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>新增卡片</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
