import { useState } from 'react';
import {
  COMPUTED_FIELD_TYPES,
  type AttachmentItem,
  type FieldMeta,
  type RecordItem,
  type TableWithSchema,
} from '@flaretable/shared';
import {
  Check,
  ExternalLink,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';
import { IOSCheckbox } from './AppleUI.js';
import { FieldTypeIcon, getChoiceBadgeClass } from './BadgeUtils.js';

interface GridViewProps {
  table: TableWithSchema;
  records: RecordItem[];
  showFieldIds: boolean;
  linkedRecordMap: Record<string, string>;
  onPatchRecord: (recordId: string, fields: Record<string, unknown>) => Promise<void>;
  onAddInlineRecord: () => Promise<void>;
  onDeleteRecords: (recordIds: string[]) => Promise<void>;
  onOpenRecord: (record: RecordItem) => void;
  onEditField: (field: FieldMeta) => void;
  onDeleteField: (fieldId: string) => Promise<void>;
  onAddField: () => void;
}

function formatNumberDisplay(val: unknown, field: FieldMeta): string {
  if (val === null || val === undefined || val === '') return '';
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  const precision = field.options.precision ?? 2;
  const formatted = num.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
  switch (field.options.numberFormat) {
    case 'currency_cny':
      return `¥${formatted}`;
    case 'currency_usd':
      return `$${formatted}`;
    case 'percent':
      return `${formatted}%`;
    default:
      return formatted;
  }
}

export function GridView({
  table,
  records,
  showFieldIds,
  linkedRecordMap,
  onPatchRecord,
  onAddInlineRecord,
  onDeleteRecords,
  onOpenRecord,
  onEditField,
  onDeleteField,
  onAddField,
}: GridViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ recId: string; fieldId: string } | null>(null);
  const [cellDraft, setCellDraft] = useState<string>('');
  const [openMenuFieldId, setOpenMenuFieldId] = useState<string | null>(null);
  const [selectPopup, setSelectPopup] = useState<{ recId: string; field: FieldMeta } | null>(null);

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const startInlineEdit = (rec: RecordItem, field: FieldMeta) => {
    if (COMPUTED_FIELD_TYPES.has(field.type)) return;
    if (field.type === 'checkbox' || field.type === 'attachment' || field.type === 'link' || field.type === 'json') {
      return;
    }
    if (field.type === 'single_select' || field.type === 'multi_select') {
      setSelectPopup({ recId: rec.id, field });
      return;
    }
    const raw = rec.fields[field.id];
    setEditingCell({ recId: rec.id, fieldId: field.id });
    setCellDraft(raw === null || raw === undefined ? '' : String(raw));
  };

  const commitInlineEdit = async (rec: RecordItem, field: FieldMeta) => {
    setEditingCell(null);
    const prevRaw = rec.fields[field.id];
    const nextVal =
      field.type === 'number'
        ? cellDraft.trim() === ''
          ? null
          : Number(cellDraft)
        : cellDraft;

    if (String(prevRaw ?? '') === String(nextVal ?? '')) return;
    await onPatchRecord(rec.id, { [field.id]: nextVal });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
      {/* 主表格滚动区 */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-max min-w-full text-[13px]">
          <thead className="sticky top-0 z-20 bg-[#F9F9FB]/95 backdrop-blur-md border-b border-black/[0.07]">
            <tr>
              {/* 行号与全选 */}
              <th className="sticky left-0 z-30 bg-[#F9F9FB]/95 backdrop-blur-md w-[68px] min-w-[68px] border-r border-black/[0.06] px-2.5 py-2.5 text-center font-medium text-[#86868B]">
                <div className="flex items-center justify-center gap-2">
                  <IOSCheckbox
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-[11px] font-mono">#</span>
                </div>
              </th>

              {/* 字段列头 */}
              {table.fields.map((field) => (
                <th
                  key={field.id}
                  className="min-w-[184px] max-w-[300px] border-r border-black/[0.06] px-3.5 py-2.5 text-left font-medium text-[#1D1D1F] select-none relative group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[#86868B] shrink-0">
                        <FieldTypeIcon type={field.type} />
                      </span>
                      <span className="truncate text-[12px] font-semibold text-[#1D1D1F]">
                        {field.name}
                      </span>
                      {field.isPrimary && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] shrink-0">
                          主列
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuFieldId((cur) => (cur === field.id ? null : field.id))
                      }
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/[0.06] text-[#86868B] transition-opacity"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showFieldIds && (
                    <div className="mt-1">
                      <code className="text-[10px] bg-[#5856D6]/10 text-[#4543B5] px-1.5 py-0.5 rounded-full">
                        {field.id}
                      </code>
                    </div>
                  )}

                  {openMenuFieldId === field.id && (
                    <div
                      onMouseLeave={() => setOpenMenuFieldId(null)}
                      className="absolute right-2 top-9 z-40 w-40 bg-white/95 backdrop-blur-2xl rounded-[14px] ios-popover p-1.5 text-[12px] font-normal space-y-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuFieldId(null);
                          onEditField(field);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-[#1D1D1F] hover:bg-[#007AFF]/10 hover:text-[#007AFF] rounded-[9px]"
                      >
                        修改字段配置
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(field.id);
                          setOpenMenuFieldId(null);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-[#1D1D1F] hover:bg-[#007AFF]/10 hover:text-[#007AFF] rounded-[9px]"
                      >
                        复制字段 ID
                      </button>
                      {!field.isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuFieldId(null);
                            if (window.confirm(`确认删除字段「${field.name}」？`)) {
                              void onDeleteField(field.id);
                            }
                          }}
                          className="w-full px-2.5 py-1.5 text-left text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-[9px]"
                        >
                          删除字段
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}

              {/* 新增列按钮 */}
              <th className="w-28 px-3.5 py-2.5 text-left">
                <button
                  type="button"
                  onClick={onAddField}
                  className="flex items-center gap-1 text-[12px] text-[#007AFF] hover:opacity-80 font-semibold whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>新增列</span>
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {records.map((rec, rowIdx) => {
              const selected = selectedIds.includes(rec.id);
              return (
                <tr
                  key={rec.id}
                  className={`border-b border-black/[0.05] group transition-colors h-[42px] ${
                    selected ? 'bg-[#007AFF]/[0.06]' : 'hover:bg-[#F2F2F7]/65'
                  }`}
                >
                  {/* 序号 + 展开抽屉按钮 */}
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-[#F8F8FA] border-r border-black/[0.06] px-2.5 py-1.5 text-center text-[#86868B]">
                    <div className="flex items-center justify-center gap-2">
                      <IOSCheckbox checked={selected} onChange={() => toggleRow(rec.id)} />
                      <span className="font-mono text-[11px] group-hover:hidden w-4">{rowIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => onOpenRecord(rec)}
                        title="展开记录详情"
                        className="hidden group-hover:inline-flex w-4 h-4 items-center justify-center rounded-full text-[#007AFF] hover:bg-[#007AFF]/12"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>

                  {/* 数据单元格 */}
                  {table.fields.map((field) => {
                    const val = rec.fields[field.id];
                    const isEditing =
                      editingCell?.recId === rec.id && editingCell?.fieldId === field.id;
                    const isComputed = COMPUTED_FIELD_TYPES.has(field.type);

                    return (
                      <td
                        key={field.id}
                        onDoubleClick={() => startInlineEdit(rec, field)}
                        onClick={() => {
                          if (field.type === 'single_select' || field.type === 'multi_select') {
                            setSelectPopup({ recId: rec.id, field });
                          }
                        }}
                        className={`border-r border-black/[0.05] px-3.5 py-1.5 max-w-[300px] align-middle relative ${
                          isComputed ? 'bg-[#F9F9FB]/70 text-[#48484A]' : 'cursor-pointer'
                        }`}
                      >
                        {isEditing ? (
                          <input
                            type={
                              field.type === 'number'
                                ? 'number'
                                : field.type === 'date'
                                  ? 'date'
                                  : 'text'
                            }
                            autoFocus
                            value={cellDraft}
                            onChange={(e) => setCellDraft(e.target.value)}
                            onBlur={() => void commitInlineEdit(rec, field)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void commitInlineEdit(rec, field);
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                              }
                            }}
                            className="w-full px-2 py-1 text-[13px] bg-white border-2 border-[#007AFF] rounded-[8px] focus:outline-none shadow-xs"
                          />
                        ) : (
                          renderCellContent({
                            field,
                            val,
                            linkedRecordMap,
                            onToggleCheckbox: (checked) =>
                              void onPatchRecord(rec.id, { [field.id]: checked }),
                            onOpenDrawer: () => onOpenRecord(rec),
                          })
                        )}

                        {/* 单选/多选毛玻璃弹出菜单 */}
                        {selectPopup?.recId === rec.id && selectPopup.field.id === field.id && (
                          <SelectOptionPopover
                            field={field}
                            value={val}
                            onClose={() => setSelectPopup(null)}
                            onChange={(nextVal) => {
                              void onPatchRecord(rec.id, { [field.id]: nextVal });
                              if (field.type === 'single_select') {
                                setSelectPopup(null);
                              }
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="px-3.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenRecord(rec)}
                      className="opacity-0 group-hover:opacity-100 text-[12px] font-medium text-[#007AFF] hover:underline whitespace-nowrap"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* 底部快捷新增行 */}
            <tr>
              <td colSpan={table.fields.length + 2} className="p-0 border-b border-black/[0.05]">
                <button
                  type="button"
                  onClick={() => void onAddInlineRecord()}
                  className="w-full px-4 py-2.5 text-left text-[12px] font-medium text-[#86868B] hover:text-[#007AFF] hover:bg-[#F9F9FB] flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span>点击新增一条记录</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {records.length === 0 && (
          <div className="py-16 px-6 text-center space-y-2 select-none">
            <div className="text-[13px] font-medium text-[#86868B]">
              当前数据表暂无记录
            </div>
            <div className="text-[12px] text-[#86868B]/75">
              点击上方「点击新增一条记录」或右上角「新增记录」开始录入，也可通过 OpenAPI / MCP 写入数据
            </div>
          </div>
        )}
      </div>

      {/* 底部悬浮毛玻璃批量操作胶囊栏 */}
      {selectedIds.length > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-white/90 backdrop-blur-2xl ios-popover text-[13px]">
          <span className="font-semibold text-[#1D1D1F] pl-1">
            已选中 {selectedIds.length} 条
          </span>
          <div className="w-[1px] h-4 bg-black/10" />
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-[#86868B] hover:text-[#1D1D1F] font-medium px-2 py-1 rounded-full"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`确定删除选中的 ${selectedIds.length} 条记录吗？`)) {
                void onDeleteRecords(selectedIds).then(() => setSelectedIds([]));
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FF3B30] hover:bg-[#E0352B] text-white font-semibold ios-press"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  );
}

function renderCellContent({
  field,
  val,
  linkedRecordMap,
  onToggleCheckbox,
  onOpenDrawer,
}: {
  field: FieldMeta;
  val: unknown;
  linkedRecordMap: Record<string, string>;
  onToggleCheckbox: (next: boolean) => void;
  onOpenDrawer: () => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center">
        <IOSCheckbox checked={Boolean(val)} onChange={onToggleCheckbox} />
      </div>
    );
  }

  if (val === null || val === undefined || val === '') {
    return <span className="text-black/20 select-none">—</span>;
  }

  if (field.type === 'number') {
    return (
      <div className="text-right font-mono text-[13px] text-[#1D1D1F] tabular-nums">
        {formatNumberDisplay(val, field)}
      </div>
    );
  }

  if (field.type === 'single_select') {
    const str = String(val);
    const choice = field.options.choices?.find((c) => c.name === str);
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getChoiceBadgeClass(choice?.color)}`}
      >
        {str}
      </span>
    );
  }

  if (field.type === 'multi_select') {
    const arr = Array.isArray(val) ? (val as string[]) : [];
    if (arr.length === 0) return <span className="text-black/20">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {arr.map((tag) => {
          const choice = field.options.choices?.find((c) => c.name === tag);
          return (
            <span
              key={tag}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getChoiceBadgeClass(choice?.color)}`}
            >
              {tag}
            </span>
          );
        })}
      </div>
    );
  }

  if (field.type === 'url') {
    return (
      <a
        href={String(val)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[#007AFF] hover:underline truncate max-w-full text-[12px]"
      >
        <span className="truncate">{String(val)}</span>
        <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    );
  }

  if (field.type === 'json') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDrawer();
        }}
        className="px-2 py-0.5 rounded-full bg-[#767680]/[0.09] hover:bg-[#767680]/[0.16] text-[#48484A] font-mono text-[11px] truncate max-w-56 block text-left transition-colors"
      >
        {JSON.stringify(val)}
      </button>
    );
  }

  if (field.type === 'attachment') {
    const items = Array.isArray(val) ? (val as AttachmentItem[]) : [];
    if (items.length === 0) return <span className="text-black/20">—</span>;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDrawer();
        }}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#767680]/[0.09] hover:bg-[#767680]/[0.16] text-[#1D1D1F] text-[11px] font-medium"
      >
        <Paperclip className="w-3 h-3 text-[#86868B]" />
        <span>{items.length} 个附件</span>
      </button>
    );
  }

  if (field.type === 'link') {
    const ids = Array.isArray(val) ? (val as string[]) : [];
    if (ids.length === 0) return <span className="text-black/20">—</span>;
    return (
      <div className="flex flex-wrap gap-1" onClick={(e) => { e.stopPropagation(); onOpenDrawer(); }}>
        {ids.map((id) => (
          <span
            key={id}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#5856D6]/12 text-[#4543B5] text-[11px] font-semibold"
          >
            {linkedRecordMap[id] ?? id}
          </span>
        ))}
      </div>
    );
  }

  if (field.type === 'formula' || field.type === 'lookup') {
    const display = Array.isArray(val) ? val.join(', ') : String(val);
    return (
      <span className="font-mono text-[12px] font-medium text-[#48484A] truncate block" title={display}>
        {display}
      </span>
    );
  }

  return (
    <span className="truncate block text-[#1D1D1F]" title={String(val)}>
      {String(val)}
    </span>
  );
}

function SelectOptionPopover({
  field,
  value,
  onChange,
  onClose,
}: {
  field: FieldMeta;
  value: unknown;
  onChange: (next: unknown) => void;
  onClose: () => void;
}) {
  const choices = field.options.choices ?? [];
  const isMulti = field.type === 'multi_select';
  const selectedArr = isMulti
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === 'string'
      ? [value]
      : [];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={onClose}
      className="absolute left-2 top-9 z-40 w-52 bg-white/95 backdrop-blur-2xl rounded-[16px] ios-popover p-1.5 space-y-0.5"
    >
      {choices.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-[#86868B]">暂无预设选项</div>
      ) : (
        choices.map((ch) => {
          const active = selectedArr.includes(ch.name);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => {
                if (isMulti) {
                  const next = active
                    ? selectedArr.filter((x) => x !== ch.name)
                    : [...selectedArr, ch.name];
                  onChange(next);
                } else {
                  onChange(active ? null : ch.name);
                }
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-[10px] hover:bg-black/[0.04] text-left"
            >
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getChoiceBadgeClass(ch.color)}`}
              >
                {ch.name}
              </span>
              {active && <Check className="w-3.5 h-3.5 text-[#007AFF]" strokeWidth={2.5} />}
            </button>
          );
        })
      )}
    </div>
  );
}
