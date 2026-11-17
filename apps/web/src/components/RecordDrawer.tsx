import { useEffect, useState } from 'react';
import {
  COMPUTED_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type AttachmentItem,
  type FieldMeta,
  type RecordItem,
  type TableWithSchema,
} from '@flaretable/shared';
import { ExternalLink, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { IOSCheckbox, IOSSheetGrabber } from './AppleUI.js';
import { FieldTypeIcon, formatBytes, getChoiceBadgeClass } from './BadgeUtils.js';

interface RecordDrawerProps {
  baseId: string;
  table: TableWithSchema;
  allTables: TableWithSchema[];
  record: RecordItem;
  onClose: () => void;
  onPatchRecord: (recordId: string, patchFields: Record<string, unknown>) => Promise<void>;
  onDeleteRecord: (recordId: string) => Promise<void>;
}

export function RecordDrawer({
  baseId,
  table,
  allTables,
  record,
  onClose,
  onPatchRecord,
  onDeleteRecord,
}: RecordDrawerProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [linkOptionsByTable, setLinkOptionsByTable] = useState<Record<string, RecordItem[]>>({});
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string>('');

  useEffect(() => {
    setDraft(record.fields);
  }, [record]);

  useEffect(() => {
    const linkFields = table.fields.filter((f) => f.type === 'link' && f.options.targetTableId);
    const targetIds = Array.from(new Set(linkFields.map((f) => f.options.targetTableId!)));
    for (const targetTableId of targetIds) {
      if (!linkOptionsByTable[targetTableId]) {
        void api
          .queryRecords(baseId, targetTableId, { limit: 100 })
          .then((res) => {
            setLinkOptionsByTable((prev) => ({ ...prev, [targetTableId]: res.records }));
          })
          .catch(() => {});
      }
    }
  }, [baseId, table, linkOptionsByTable]);

  const commitField = async (field: FieldMeta, val: unknown) => {
    setDraft((prev) => ({ ...prev, [field.id]: val }));
    await onPatchRecord(record.id, { [field.id]: val });
  };

  const handleUploadFile = async (field: FieldMeta, file: File) => {
    setUploadingFieldId(field.id);
    setUploadError('');
    try {
      const res = await api.uploadAttachment(baseId, file, table.id, record.id);
      const current = Array.isArray(draft[field.id]) ? (draft[field.id] as AttachmentItem[]) : [];
      const next = [...current, res.attachment];
      await commitField(field, next);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '附件上传失败');
    } finally {
      setUploadingFieldId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]">
      <div className="fixed top-3 bottom-3 right-3 w-[calc(100vw-24px)] max-w-[540px] bg-[#F2F2F7] rounded-[24px] ios-popover flex flex-col overflow-hidden">
        <IOSSheetGrabber />

        {/* 毛玻璃吸顶标题栏 */}
        <div className="px-5 py-3 bg-[#F2F2F7]/90 backdrop-blur-xl border-b border-black/[0.06] flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-3">
            <div className="text-[11px] font-mono text-[#86868B]">
              {record.id} · v{record.version}
            </div>
            <h3 className="text-[16px] font-bold tracking-tight text-[#1D1D1F] truncate mt-0.5">
              {String(record.fields[table.primaryFieldId] ?? '未命名记录')}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('确认删除该条记录吗？')) {
                  void onDeleteRecord(record.id).then(onClose);
                }
              }}
              className="w-8 h-8 rounded-full bg-white text-[#FF3B30] hover:bg-[#FF3B30]/10 flex items-center justify-center shadow-2xs ios-press"
              title="删除记录"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-[#86868B] hover:text-[#1D1D1F] flex items-center justify-center ios-press"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Inset Grouped 表单卡片列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {uploadError && (
            <div className="p-3 rounded-[14px] bg-[#FF3B30]/12 text-[12px] text-[#C8231C]">
              {uploadError}
            </div>
          )}

          {table.fields.map((field) => {
            const val = draft[field.id];
            const isComputed = COMPUTED_FIELD_TYPES.has(field.type);

            return (
              <div
                key={field.id}
                className="bg-white rounded-[16px] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.04)] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1D1D1F]">
                    <span className="text-[#007AFF]">
                      <FieldTypeIcon type={field.type} />
                    </span>
                    <span>{field.name}</span>
                    {isComputed && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#767680]/10 text-[#86868B]">
                        只读计算
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] font-mono text-[#86868B]">
                    {FIELD_TYPE_LABELS[field.type]}
                  </span>
                </div>

                {isComputed ? (
                  <div className="px-3 py-2 text-[13px] bg-[#F2F2F7] rounded-[11px] text-[#48484A] font-mono">
                    {val === null || val === undefined
                      ? '—'
                      : Array.isArray(val)
                        ? val.join(', ')
                        : String(val)}
                  </div>
                ) : field.type === 'checkbox' ? (
                  <div className="pt-0.5">
                    <IOSCheckbox
                      checked={Boolean(val)}
                      onChange={(checked) => void commitField(field, checked)}
                      label={Boolean(val) ? '已启用 (true)' : '未启用 (false)'}
                    />
                  </div>
                ) : field.type === 'single_select' ? (
                  <select
                    value={typeof val === 'string' ? val : ''}
                    onChange={(e) => void commitField(field, e.target.value || null)}
                    className="w-full px-3 py-2 text-[13px] bg-[#F2F2F7] rounded-[11px] focus:outline-none"
                  >
                    <option value="">（未选择）</option>
                    {(field.options.choices ?? []).map((ch) => (
                      <option key={ch.id} value={ch.name}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'multi_select' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(field.options.choices ?? []).map((ch) => {
                      const arr = Array.isArray(val) ? (val as string[]) : [];
                      const checked = arr.includes(ch.name);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            const next = checked
                              ? arr.filter((x) => x !== ch.name)
                              : [...arr, ch.name];
                            void commitField(field, next);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-all ios-press ${
                            checked
                              ? `${getChoiceBadgeClass(ch.color)} ring-2 ring-[#007AFF]/40`
                              : 'bg-[#F2F2F7] text-[#86868B] border-transparent'
                          }`}
                        >
                          {ch.name}
                        </button>
                      );
                    })}
                  </div>
                ) : field.type === 'json' ? (
                  <JsonFieldEditor
                    value={val}
                    onCommit={(parsed) => void commitField(field, parsed)}
                  />
                ) : field.type === 'attachment' ? (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      {(Array.isArray(val) ? (val as AttachmentItem[]) : []).map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between px-3 py-2 rounded-[11px] bg-[#F2F2F7] text-[12px]"
                        >
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-[#007AFF] hover:underline truncate"
                          >
                            <Paperclip className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate font-medium">{att.name}</span>
                            <span className="text-[#86868B] font-mono shrink-0">
                              ({formatBytes(att.size)})
                            </span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (val as AttachmentItem[]).filter((x) => x.id !== att.id);
                              void commitField(field, next);
                            }}
                            className="text-[#86868B] hover:text-[#FF3B30] ml-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#007AFF]/10 hover:bg-[#007AFF]/16 text-[12px] font-semibold text-[#007AFF] cursor-pointer ios-press">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingFieldId === field.id ? '正在安全上传至 R2...' : '上传附件至 R2'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingFieldId === field.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadFile(field, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                ) : field.type === 'link' ? (
                  <div className="p-2 bg-[#F2F2F7] rounded-[12px] space-y-1 max-h-40 overflow-y-auto">
                    {(() => {
                      const targetId = field.options.targetTableId ?? '';
                      const targetTable = allTables.find((t) => t.id === targetId);
                      const candidates = linkOptionsByTable[targetId] ?? [];
                      const selectedIds = Array.isArray(val) ? (val as string[]) : [];
                      if (candidates.length === 0) {
                        return <div className="text-[12px] text-[#86868B] p-1">目标表暂无可关联记录</div>;
                      }
                      return candidates.map((cand) => {
                        const checked = selectedIds.includes(cand.id);
                        const label = targetTable
                          ? String(cand.fields[targetTable.primaryFieldId] ?? cand.id)
                          : cand.id;
                        return (
                          <div
                            key={cand.id}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-[9px] hover:bg-white transition-colors"
                          >
                            <IOSCheckbox
                              checked={checked}
                              label={label}
                              onChange={() => {
                                let next: string[];
                                if (checked) {
                                  next = selectedIds.filter((id) => id !== cand.id);
                                } else if (field.options.allowMultiple === false) {
                                  next = [cand.id];
                                } else {
                                  next = [...selectedIds, cand.id];
                                }
                                void commitField(field, next);
                              }}
                            />
                            <span className="font-mono text-[10px] text-[#86868B]">{cand.id}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <input
                    type={
                      field.type === 'number'
                        ? 'number'
                        : field.type === 'date'
                          ? 'date'
                          : field.type === 'email'
                            ? 'email'
                            : field.type === 'url'
                              ? 'url'
                              : 'text'
                    }
                    value={val === null || val === undefined ? '' : String(val)}
                    onChange={(e) => setDraft((p) => ({ ...p, [field.id]: e.target.value }))}
                    onBlur={(e) => {
                      const raw = e.target.value;
                      if (raw !== String(record.fields[field.id] ?? '')) {
                        void commitField(
                          field,
                          field.type === 'number' ? (raw === '' ? null : Number(raw)) : raw,
                        );
                      }
                    }}
                    className="w-full px-3 py-2 text-[13px] bg-[#F2F2F7] focus:bg-white rounded-[11px] border border-transparent focus:border-[#007AFF] focus:outline-none transition-colors"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JsonFieldEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (parsed: unknown) => void;
}) {
  const [text, setText] = useState(() => (value ? JSON.stringify(value, null, 2) : ''));
  const [err, setErr] = useState('');

  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : '');
    setErr('');
  }, [value]);

  return (
    <div className="space-y-1">
      <textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr('');
        }}
        onBlur={() => {
          if (!text.trim()) {
            onCommit(null);
            return;
          }
          try {
            const parsed = JSON.parse(text);
            setErr('');
            onCommit(parsed);
          } catch {
            setErr('JSON 语法格式有误，未保存');
          }
        }}
        placeholder='{"key": "value"}'
        className="w-full px-3 py-2 text-[12px] font-mono bg-[#F2F2F7] focus:bg-white rounded-[11px] border border-transparent focus:border-[#007AFF] focus:outline-none"
      />
      {err && <div className="text-[11px] text-[#FF3B30]">{err}</div>}
    </div>
  );
}
