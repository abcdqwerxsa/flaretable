import { useEffect, useMemo, useState } from 'react';
import {
  COMPUTED_FIELD_TYPES,
  FORM_THEMES,
  type FieldMeta,
  type FormTheme,
  type TableWithSchema,
  type ViewConfig,
  type ViewMeta,
} from '@flaretable/shared';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Palette,
  Save,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { api, type PublicFormInfo } from '../lib/api.js';
import { IOSCheckbox, IOSSquircleIcon, IOSSwitch } from './AppleUI.js';
import { FieldTypeIcon, getChoiceBadgeClass } from './BadgeUtils.js';

const THEME_STYLES: Record<
  FormTheme,
  { label: string; dot: string; banner: string; button: string }
> = {
  blue: {
    label: '系统蓝',
    dot: 'bg-[#007AFF]',
    banner: 'from-[#007AFF] to-[#5856D6]',
    button: 'bg-[#007AFF] hover:bg-[#0066D6] shadow-[0_2px_10px_rgba(0,122,255,0.28)]',
  },
  indigo: {
    label: '靛青紫',
    dot: 'bg-[#5856D6]',
    banner: 'from-[#5856D6] to-[#AF52DE]',
    button: 'bg-[#5856D6] hover:bg-[#4947BD] shadow-[0_2px_10px_rgba(88,86,214,0.28)]',
  },
  emerald: {
    label: '翡翠绿',
    dot: 'bg-[#34C759]',
    banner: 'from-[#34C759] to-[#00A878]',
    button: 'bg-[#34C759] hover:bg-[#2DB24E] shadow-[0_2px_10px_rgba(52,199,89,0.28)]',
  },
  amber: {
    label: '暖阳橙',
    dot: 'bg-[#FF9500]',
    banner: 'from-[#FF9500] to-[#FF5E3A]',
    button: 'bg-[#FF9500] hover:bg-[#E08400] shadow-[0_2px_10px_rgba(255,149,0,0.28)]',
  },
  rose: {
    label: '珊瑚红',
    dot: 'bg-[#FF3B30]',
    banner: 'from-[#FF3B30] to-[#FF2D55]',
    button: 'bg-[#FF3B30] hover:bg-[#E0352B] shadow-[0_2px_10px_rgba(255,59,48,0.28)]',
  },
  slate: {
    label: '极简黑',
    dot: 'bg-[#1D1D1F]',
    banner: 'from-[#3A3A3C] to-[#1D1D1F]',
    button: 'bg-[#1D1D1F] hover:bg-black shadow-[0_2px_10px_rgba(0,0,0,0.22)]',
  },
};

interface FormViewProps {
  table: TableWithSchema;
  view: ViewMeta;
  onUpdateViewConfig: (config: ViewConfig) => Promise<void>;
  onSubmitInternal: (fields: Record<string, unknown>) => Promise<void>;
}

export function FormView({
  table,
  view,
  onUpdateViewConfig,
  onSubmitInternal,
}: FormViewProps) {
  const allEditableFields = useMemo(
    () =>
      table.fields.filter(
        (f) => !COMPUTED_FIELD_TYPES.has(f.type) && f.type !== 'link' && f.type !== 'attachment',
      ),
    [table.fields],
  );

  const [title, setTitle] = useState(view.config.formTitle ?? `${table.name} - 收集表单`);
  const [desc, setDesc] = useState(
    view.config.formDescription ?? '填写以下信息，提交后将自动进入多维表格。',
  );
  const [theme, setTheme] = useState<FormTheme>(view.config.formTheme ?? 'blue');
  const [submitText, setSubmitText] = useState(view.config.formSubmitText ?? '提交');
  const [successMessage, setSuccessMessage] = useState(
    view.config.formSuccessMessage ?? '感谢填写，您的内容已成功录入系统。',
  );
  const [allowResubmit, setAllowResubmit] = useState(view.config.formAllowResubmit ?? true);
  const [publicEnabled, setPublicEnabled] = useState(Boolean(view.config.publicEnabled));
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    view.config.formFieldIds && view.config.formFieldIds.length > 0
      ? view.config.formFieldIds
      : allEditableFields.map((f) => f.id),
  );
  const [requiredFieldIds, setRequiredFieldIds] = useState<string[]>(
    view.config.formRequiredFieldIds ?? [table.primaryFieldId],
  );
  const [fieldHints, setFieldHints] = useState<Record<string, string>>(
    view.config.formFieldHints ?? {},
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTip, setSavedTip] = useState(false);
  const [copied, setCopied] = useState(false);

  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    setTitle(view.config.formTitle ?? `${table.name} - 收集表单`);
    setDesc(view.config.formDescription ?? '填写以下信息，提交后将自动进入多维表格。');
    setTheme(view.config.formTheme ?? 'blue');
    setSubmitText(view.config.formSubmitText ?? '提交');
    setSuccessMessage(
      view.config.formSuccessMessage ?? '感谢填写，您的内容已成功录入系统。',
    );
    setAllowResubmit(view.config.formAllowResubmit ?? true);
    setPublicEnabled(Boolean(view.config.publicEnabled));
    setSelectedFieldIds(
      view.config.formFieldIds && view.config.formFieldIds.length > 0
        ? view.config.formFieldIds
        : allEditableFields.map((f) => f.id),
    );
    setRequiredFieldIds(view.config.formRequiredFieldIds ?? [table.primaryFieldId]);
    setFieldHints(view.config.formFieldHints ?? {});
    setDirty(false);
  }, [view, table.name, table.primaryFieldId, allEditableFields]);

  const shareUrl = view.config.publicShareToken
    ? `${window.location.origin}/f/${view.config.publicShareToken}`
    : '';

  const buildConfig = (overridePublic?: boolean): ViewConfig => ({
    ...view.config,
    formTitle: title.trim() || `${table.name} - 收集表单`,
    formDescription: desc,
    formTheme: theme,
    formSubmitText: submitText.trim() || '提交',
    formSuccessMessage: successMessage.trim() || '感谢填写，您的内容已成功录入系统。',
    formAllowResubmit: allowResubmit,
    formFieldIds: selectedFieldIds,
    formRequiredFieldIds: requiredFieldIds,
    formFieldHints: fieldHints,
    publicEnabled: overridePublic ?? publicEnabled,
  });

  const handleSaveSettings = async (overridePublic?: boolean) => {
    setSaving(true);
    try {
      await onUpdateViewConfig(buildConfig(overridePublic));
      setDirty(false);
      setSavedTip(true);
      setTimeout(() => setSavedTip(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const exposedFields = useMemo(() => {
    const idSet = new Set(selectedFieldIds);
    return allEditableFields.filter((f) => idSet.has(f.id));
  }, [allEditableFields, selectedFieldIds]);

  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewError('');
    for (const f of exposedFields) {
      if (requiredFieldIds.includes(f.id)) {
        const val = previewValues[f.id];
        const empty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0) ||
          (f.type === 'checkbox' && val !== true);
        if (empty) {
          setPreviewError(`请填写必填项「${f.name}」`);
          return;
        }
      }
    }
    await onSubmitInternal(previewValues);
    setPreviewValues({});
    setPreviewSubmitted(true);
    setTimeout(() => setPreviewSubmitted(false), 2500);
  };

  const themeStyle = THEME_STYLES[theme] ?? THEME_STYLES.blue;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F2F2F7] p-5">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 左侧：iPadOS 表单可视化配置面板 */}
        <div className="lg:col-span-5 space-y-3.5">
          {/* 1. 公开分享链接开关卡 */}
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.06)] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IOSSquircleIcon tone={publicEnabled ? 'green' : 'slate'} size="md">
                  <Globe className="w-4 h-4" />
                </IOSSquircleIcon>
                <div>
                  <div className="text-[13px] font-semibold text-[#1D1D1F]">外部公开收集链接</div>
                  <div className="text-[11px] text-[#86868B]">
                    {publicEnabled ? '已开启免登录填报' : '开启后生成独立分享 URL'}
                  </div>
                </div>
              </div>
              <IOSSwitch
                checked={publicEnabled}
                disabled={saving}
                onChange={(next) => {
                  setPublicEnabled(next);
                  void handleSaveSettings(next);
                }}
              />
            </div>

            {publicEnabled && shareUrl && (
              <div className="flex items-center gap-2 pt-2 border-t border-black/[0.06]">
                <code className="flex-1 px-2.5 py-1.5 rounded-[10px] bg-[#F2F2F7] text-[11px] text-[#48484A] truncate">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="px-2.5 py-1.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-semibold flex items-center gap-1 shrink-0 ios-press"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="新窗口打开公开表单"
                  className="w-7 h-7 rounded-full bg-[#767680]/[0.09] hover:bg-[#767680]/[0.16] flex items-center justify-center text-[#007AFF] shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* 2. 表单标题、说明与主题外观设置卡 */}
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.06)] space-y-3.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1D1D1F]">
              <Palette className="w-4 h-4 text-[#007AFF]" />
              <span>标题与外观设置</span>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#86868B]">表单标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                placeholder="输入公开表单主标题..."
                className="w-full px-3 py-2 text-[13px] bg-[#F2F2F7] focus:bg-white rounded-[11px] border border-transparent focus:border-[#007AFF] focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#86868B]">
                表单说明 / 填写须知
              </label>
              <textarea
                rows={2}
                value={desc}
                onChange={(e) => {
                  setDesc(e.target.value);
                  setDirty(true);
                }}
                placeholder="补充表单用途或填写要求..."
                className="w-full px-3 py-2 text-[12px] bg-[#F2F2F7] focus:bg-white rounded-[11px] border border-transparent focus:border-[#007AFF] focus:outline-none resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[#86868B]">主题色板</label>
              <div className="flex items-center gap-2.5">
                {FORM_THEMES.map((tk) => {
                  const st = THEME_STYLES[tk];
                  const active = theme === tk;
                  return (
                    <button
                      key={tk}
                      type="button"
                      title={st.label}
                      onClick={() => {
                        setTheme(tk);
                        setDirty(true);
                      }}
                      className={`w-7 h-7 rounded-full ${st.dot} flex items-center justify-center text-white transition-transform ios-press ${
                        active ? 'ring-2 ring-offset-2 ring-[#007AFF] scale-105' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" strokeWidth={2.8} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#86868B]">提交按钮文案</label>
                <input
                  type="text"
                  value={submitText}
                  onChange={(e) => {
                    setSubmitText(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="提交"
                  className="w-full px-3 py-1.5 text-[12px] bg-[#F2F2F7] focus:bg-white rounded-[10px] border border-transparent focus:border-[#007AFF] focus:outline-none"
                />
              </div>
              <div className="flex items-end justify-between pb-1 px-1">
                <span className="text-[12px] font-medium text-[#1D1D1F]">允许再填一份</span>
                <IOSSwitch
                  checked={allowResubmit}
                  onChange={(v) => {
                    setAllowResubmit(v);
                    setDirty(true);
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#86868B]">提交成功提示语</label>
              <input
                type="text"
                value={successMessage}
                onChange={(e) => {
                  setSuccessMessage(e.target.value);
                  setDirty(true);
                }}
                className="w-full px-3 py-1.5 text-[12px] bg-[#F2F2F7] focus:bg-white rounded-[10px] border border-transparent focus:border-[#007AFF] focus:outline-none"
              />
            </div>
          </div>

          {/* 3. 字段显隐、必填与提示设置卡 */}
          <div className="bg-white rounded-[18px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.06)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1D1D1F]">
                <SlidersHorizontal className="w-4 h-4 text-[#007AFF]" />
                <span>收集字段配置 ({exposedFields.length}/{allEditableFields.length})</span>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allEditableFields.map((field) => {
                const visible = selectedFieldIds.includes(field.id);
                const required = requiredFieldIds.includes(field.id);
                return (
                  <div
                    key={field.id}
                    className={`p-2.5 rounded-[12px] border transition-colors space-y-2 ${
                      visible ? 'bg-[#F9F9FB] border-black/[0.06]' : 'bg-[#F2F2F7]/50 border-transparent opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[#86868B]">
                          <FieldTypeIcon type={field.type} />
                        </span>
                        <span className="text-[12px] font-semibold text-[#1D1D1F] truncate">
                          {field.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {visible && (
                          <IOSCheckbox
                            checked={required}
                            label="必填"
                            onChange={(nextReq) => {
                              setRequiredFieldIds((prev) =>
                                nextReq
                                  ? [...prev, field.id]
                                  : prev.filter((id) => id !== field.id),
                              );
                              setDirty(true);
                            }}
                          />
                        )}
                        <IOSSwitch
                          checked={visible}
                          onChange={(nextVis) => {
                            setSelectedFieldIds((prev) => {
                              if (nextVis) return [...prev, field.id];
                              // 至少保留一个字段供提交
                              return prev.length > 1 ? prev.filter((id) => id !== field.id) : prev;
                            });
                            setDirty(true);
                          }}
                        />
                      </div>
                    </div>

                    {visible && (
                      <input
                        type="text"
                        value={fieldHints[field.id] ?? ''}
                        onChange={(e) => {
                          setFieldHints((prev) => ({ ...prev, [field.id]: e.target.value }));
                          setDirty(true);
                        }}
                        placeholder="可选：填写引导提示语..."
                        className="w-full px-2.5 py-1 text-[11px] bg-white rounded-[8px] border border-black/[0.08] focus:outline-none focus:border-[#007AFF]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 显式保存条 */}
          <div className="flex items-center justify-between bg-white rounded-[16px] p-3 shadow-[0_2px_10px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.06)]">
            <span className="text-[12px] text-[#86868B] pl-1">
              {savedTip ? (
                <span className="text-[#1E823C] font-semibold">✓ 已保存并同步至分享页</span>
              ) : dirty ? (
                <span className="text-[#B25E00] font-medium">有未保存的表单修改</span>
              ) : (
                '表单配置已同步'
              )}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveSettings()}
              className={`px-4 py-2 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-all ios-press ${
                dirty
                  ? 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-[0_2px_8px_rgba(0,122,255,0.28)]'
                  : 'bg-[#767680]/[0.1] text-[#1D1D1F] hover:bg-[#767680]/[0.16]'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '保存中...' : '保存表单设置'}</span>
            </button>
          </div>
        </div>

        {/* 右侧：实时效果预览卡片 */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-[12px] text-[#86868B]">
            <span className="flex items-center gap-1.5 font-medium">
              <Eye className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>实时填报效果预览</span>
            </span>
            <span>提交后直接写入「{table.name}」</span>
          </div>

          <div className="bg-white rounded-[24px] shadow-[0_6px_28px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className={`h-2.5 bg-gradient-to-r ${themeStyle.banner}`} />
            <div className="p-6 border-b border-black/[0.06] space-y-1.5">
              <h2 className="text-[20px] font-bold tracking-tight text-[#1D1D1F]">
                {title || `${table.name} - 收集表单`}
              </h2>
              {desc && <p className="text-[13px] text-[#86868B] leading-relaxed">{desc}</p>}
            </div>

            <form onSubmit={handlePreviewSubmit} className="p-6 space-y-4">
              {previewError && (
                <div className="p-3 rounded-[14px] bg-[#FF3B30]/10 text-[12px] text-[#C8231C]">
                  {previewError}
                </div>
              )}

              {exposedFields.map((field) => (
                <FormFieldControl
                  key={field.id}
                  field={field}
                  required={requiredFieldIds.includes(field.id)}
                  hint={fieldHints[field.id]}
                  value={previewValues[field.id]}
                  onChange={(v) => setPreviewValues((prev) => ({ ...prev, [field.id]: v }))}
                />
              ))}

              {previewSubmitted && (
                <div className="flex items-center gap-2 p-3 rounded-[14px] bg-[#34C759]/12 text-[13px] font-medium text-[#1E823C]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMessage || '已写入数据表！'}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className={`w-full py-2.5 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all ios-press ${themeStyle.button}`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitText || '提交'}（预览测试）</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 独立外部免登录填报页面（路由 `/f/:shareToken`）
 */
export function PublicFormPage({ shareToken }: { shareToken: string }) {
  const [info, setInfo] = useState<PublicFormInfo | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void api
      .getPublicForm(shareToken)
      .then((res) => setInfo(res))
      .catch((err) => setError(err instanceof Error ? err.message : '加载表单失败'))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setError('');
    for (const field of info.fields) {
      if (info.requiredFieldIds.includes(field.id)) {
        const val = values[field.id];
        const empty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0) ||
          (field.type === 'checkbox' && val !== true);
        if (empty) {
          setError(`请填写必填项「${field.name}」`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await api.submitPublicForm(shareToken, values);
      setDone(true);
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center text-[13px] text-[#86868B]">
        正在加载表单...
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <div className="bg-white rounded-[22px] ios-floating-panel p-6 max-w-md w-full text-center space-y-2">
          <div className="text-[15px] font-semibold text-[#FF3B30]">无法访问该表单</div>
          <p className="text-[13px] text-[#86868B]">{error}</p>
        </div>
      </div>
    );
  }

  const themeStyle = THEME_STYLES[info?.theme ?? 'blue'] ?? THEME_STYLES.blue;

  return (
    <div className="min-h-screen bg-[#F2F2F7] py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-[24px] ios-floating-panel overflow-hidden">
        <div className={`h-2.5 bg-gradient-to-r ${themeStyle.banner}`} />
        <div className="p-6 border-b border-black/[0.06]">
          <div className="text-[11px] font-semibold text-[#86868B] mb-1">
            FlareTable · {info?.tableName}
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#1D1D1F]">{info?.title}</h1>
          {info?.description && (
            <p className="text-[13px] text-[#86868B] mt-1.5 leading-relaxed">{info.description}</p>
          )}
        </div>

        {done ? (
          <div className="p-10 text-center space-y-3">
            <CheckCircle2 className="w-11 h-11 text-[#34C759] mx-auto" />
            <h2 className="text-[17px] font-semibold text-[#1D1D1F]">提交成功</h2>
            <p className="text-[13px] text-[#86868B]">{info?.successMessage}</p>
            {info?.allowResubmit && (
              <button
                type="button"
                onClick={() => setDone(false)}
                className={`px-5 py-2 text-[13px] font-semibold text-white rounded-full ios-press ${themeStyle.button}`}
              >
                再填写一份
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-[14px] bg-[#FF3B30]/10 text-[13px] text-[#C8231C]">
                {error}
              </div>
            )}

            {(info?.fields ?? []).map((field) => (
              <FormFieldControl
                key={field.id}
                field={field}
                required={info?.requiredFieldIds.includes(field.id) ?? false}
                hint={info?.fieldHints[field.id]}
                value={values[field.id]}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
              />
            ))}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 rounded-full text-white text-[14px] font-semibold disabled:opacity-50 ios-press ${themeStyle.button}`}
            >
              {submitting ? '正在提交...' : info?.submitText || '提交'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function FormFieldControl({
  field,
  required,
  hint,
  value,
  onChange,
}: {
  field: FieldMeta;
  required: boolean;
  hint?: string;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-[#1D1D1F]">
        {field.name}
        {required && <span className="text-[#FF3B30] ml-1">*</span>}
      </label>
      {hint && <p className="text-[11px] text-[#86868B]">{hint}</p>}

      {field.type === 'checkbox' ? (
        <div className="pt-0.5">
          <IOSCheckbox
            checked={Boolean(value)}
            onChange={(checked) => onChange(checked)}
            label="勾选确认"
          />
        </div>
      ) : field.type === 'single_select' ? (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full px-3.5 py-2.5 text-[13px] bg-[#F2F2F7] border border-transparent focus:bg-white focus:border-[#007AFF] rounded-[12px] focus:outline-none"
        >
          <option value="">请选择...</option>
          {(field.options.choices ?? []).map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      ) : field.type === 'multi_select' ? (
        <div className="flex flex-wrap gap-1.5">
          {(field.options.choices ?? []).map((ch) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const active = arr.includes(ch.name);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() =>
                  onChange(active ? arr.filter((x) => x !== ch.name) : [...arr, ch.name])
                }
                className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition-all ios-press ${
                  active
                    ? `${getChoiceBadgeClass(ch.color)} ring-2 ring-[#007AFF]/40`
                    : 'bg-[#F2F2F7] text-[#86868B] border-transparent'
                }`}
              >
                {ch.name}
              </button>
            );
          })}
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
          required={required}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(
              field.type === 'number'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          placeholder={hint || `请输入${field.name}...`}
          className="w-full px-3.5 py-2.5 text-[13px] bg-[#F2F2F7] border border-transparent focus:bg-white focus:border-[#007AFF] rounded-[12px] focus:outline-none transition-colors"
        />
      )}
    </div>
  );
}
