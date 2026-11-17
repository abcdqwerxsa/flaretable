import type { AttachmentItem, RecordItem, TableWithSchema } from '@flaretable/shared';
import { Sparkles } from 'lucide-react';
import { CHOICE_GRADIENT_COVERS, getChoiceBadgeClass } from './BadgeUtils.js';

interface GalleryViewProps {
  table: TableWithSchema;
  records: RecordItem[];
  linkedRecordMap: Record<string, string>;
  onOpenRecord: (record: RecordItem) => void;
}

export function GalleryView({
  table,
  records,
  linkedRecordMap,
  onOpenRecord,
}: GalleryViewProps) {
  const attachmentField = table.fields.find((f) => f.type === 'attachment');
  const firstSelectField = table.fields.find((f) => f.type === 'single_select');
  const displayFields = table.fields
    .filter((f) => f.id !== table.primaryFieldId && f.type !== 'attachment')
    .slice(0, 4);

  return (
    <div className="flex-1 overflow-y-auto bg-[#F2F2F7]/65 p-5">
      {records.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[13px] text-[#86868B]">
          当前筛选条件下暂无记录
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {records.map((rec) => {
            const title = String(rec.fields[table.primaryFieldId] ?? '未命名记录');
            const attachments = attachmentField
              ? ((rec.fields[attachmentField.id] as AttachmentItem[] | undefined) ?? [])
              : [];
            const imageAtt = attachments.find((a) => a.mimeType.startsWith('image/'));

            const statusVal = firstSelectField ? rec.fields[firstSelectField.id] : undefined;
            const statusColor =
              firstSelectField?.options.choices?.find((c) => c.name === String(statusVal))?.color ??
              'blue';
            const coverGrad = CHOICE_GRADIENT_COVERS[statusColor] ?? CHOICE_GRADIENT_COVERS.blue;

            return (
              <div
                key={rec.id}
                onClick={() => onOpenRecord(rec)}
                className="bg-white rounded-[18px] overflow-hidden shadow-[0_3px_12px_rgba(0,0,0,0.045),0_0_0_0.5px_rgba(0,0,0,0.06)] hover:shadow-[0_10px_28px_rgba(0,122,255,0.12),0_0_0_1px_rgba(0,122,255,0.3)] cursor-pointer transition-all flex flex-col ios-press"
              >
                <div
                  className={`h-28 bg-gradient-to-br ${coverGrad} border-b border-black/[0.04] flex items-center justify-between px-4 overflow-hidden relative`}
                >
                  {imageAtt ? (
                    <img
                      src={imageAtt.url}
                      alt={imageAtt.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <div className="w-9 h-9 rounded-[11px] bg-white/75 backdrop-blur-md flex items-center justify-center text-[#007AFF] shadow-2xs">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      {typeof statusVal === 'string' && statusVal && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/85 backdrop-blur-md shadow-2xs ${getChoiceBadgeClass(statusColor)}`}
                        >
                          {statusVal}
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="p-4 space-y-3 flex-1">
                  <h4 className="text-[14px] font-semibold text-[#1D1D1F] leading-snug line-clamp-2">
                    {title}
                  </h4>

                  <div className="space-y-2">
                    {displayFields.map((field) => {
                      const val = rec.fields[field.id];
                      if (val === null || val === undefined || val === '') return null;
                      if (Array.isArray(val) && val.length === 0) return null;

                      return (
                        <div key={field.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="text-[#86868B] shrink-0">{field.name}</span>
                          {field.type === 'single_select' ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getChoiceBadgeClass(
                                field.options.choices?.find((c) => c.name === String(val))?.color,
                              )}`}
                            >
                              {String(val)}
                            </span>
                          ) : field.type === 'link' ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#5856D6]/12 text-[#4543B5] text-[11px] font-semibold truncate">
                              {Array.isArray(val)
                                ? val.map((id) => linkedRecordMap[String(id)] ?? String(id)).join('、')
                                : String(val)}
                            </span>
                          ) : (
                            <span className="text-[#1D1D1F] truncate font-medium">
                              {Array.isArray(val) ? val.join(', ') : String(val)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
