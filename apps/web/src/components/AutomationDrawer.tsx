import { useEffect, useState } from 'react';
import {
  API_SCOPE_LABELS,
  API_SCOPES,
  AUTOMATION_EVENT_TYPES,
  type ApiScope,
  type AutomationEventType,
  type StorageQuota,
  type TableWithSchema,
} from '@flaretable/shared';
import {
  Bot,
  Check,
  Copy,
  HardDrive,
  KeyRound,
  Play,
  Plus,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import {
  api,
  type ApiTokenItem,
  type WebhookDeliveryLog,
  type WebhookItem,
} from '../lib/api.js';
import { IOSCheckbox, IOSSheetGrabber, IOSSquircleIcon, IOSSwitch } from './AppleUI.js';
import { formatBytes } from './BadgeUtils.js';

interface AutomationDrawerProps {
  activeBaseId: string | null;
  activeTable: TableWithSchema | null;
  onClose: () => void;
}

export function AutomationDrawer({
  activeBaseId,
  activeTable,
  onClose,
}: AutomationDrawerProps) {
  const [tab, setTab] = useState<'tokens' | 'webhooks' | 'guides'>('tokens');
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [quota, setQuota] = useState<StorageQuota | null>(null);

  const [tokenName, setTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([
    'base:read',
    'records:read',
    'records:write',
  ]);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string>('');

  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<AutomationEventType[]>([
    'record.created',
    'record.updated',
    'form.submitted',
  ]);
  const [logsByWebhook, setLogsByWebhook] = useState<Record<string, WebhookDeliveryLog[]>>({});
  const [testingWhId, setTestingWhId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string>('');

  const loadAll = async () => {
    const [tList, wList, q] = await Promise.all([
      api.listTokens(),
      api.listWebhooks(activeBaseId ?? undefined),
      api.getStorageQuota(),
    ]);
    setTokens(tList);
    setWebhooks(wList);
    setQuota(q);
  };

  useEffect(() => {
    void loadAll();
  }, [activeBaseId]);

  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(''), 1800);
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim() || selectedScopes.length === 0) return;
    const res = await api.createToken({
      name: tokenName.trim(),
      scopes: selectedScopes,
    });
    setNewlyCreatedToken(res.plainTextToken);
    setTokenName('');
    await loadAll();
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBaseId || !whName.trim() || !whUrl.trim()) return;
    await api.createWebhook({
      baseId: activeBaseId,
      name: whName.trim(),
      targetUrl: whUrl.trim(),
      events: whEvents,
    });
    setWhName('');
    setWhUrl('');
    await loadAll();
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingWhId(webhookId);
    try {
      await api.testWebhook(webhookId);
      const logs = await api.listWebhookDeliveries(webhookId);
      setLogsByWebhook((prev) => ({ ...prev, [webhookId]: logs }));
    } finally {
      setTestingWhId(null);
    }
  };

  const origin = window.location.origin;
  const sampleBase = activeBaseId ?? '<baseId>';
  const sampleTable = activeTable?.id ?? '<tableId>';
  const primaryFieldName =
    activeTable?.fields.find((f) => f.id === activeTable.primaryFieldId)?.name ?? '标题';

  const curlSnippet = `curl -X POST "${origin}/api/v1/bases/${sampleBase}/tables/${sampleTable}/records/upsert" \\
  -H "Authorization: Bearer ft_live_你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fieldKeyType": "name",
    "matchField": "${primaryFieldName}",
    "records": [{ "fields": { "${primaryFieldName}": "n8n 自动写入演示条目" } }]
  }'`;

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        flaretable: {
          type: 'streamable-http',
          url: `${origin}/mcp`,
          headers: {
            Authorization: 'Bearer ft_live_你的密钥',
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]">
      <div className="fixed top-3 bottom-3 right-3 w-[calc(100vw-24px)] max-w-[680px] bg-[#F2F2F7] rounded-[24px] ios-popover flex flex-col overflow-hidden">
        <IOSSheetGrabber />

        {/* 顶栏 */}
        <div className="px-5 py-3 bg-[#F2F2F7]/90 backdrop-blur-xl border-b border-black/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <IOSSquircleIcon tone="green" size="md">
              <Webhook className="w-4 h-4" />
            </IOSSquircleIcon>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-[#1D1D1F]">
                自动化与 MCP 开放中心
              </h2>
              <p className="text-[11px] text-[#86868B]">
                API Token · Cloudflare Queues Webhook · 原生 MCP Server
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-[#86868B] flex items-center justify-center ios-press"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* R2 2GB 配额状态条 */}
        {quota && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-white rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-between gap-4 text-[12px] shrink-0">
            <div className="flex items-center gap-2 text-[#1D1D1F]">
              <HardDrive className="w-4 h-4 text-[#007AFF]" />
              <span className="font-semibold">R2 存储守卫</span>
              <span className="font-mono text-[#86868B]">
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.maxTotalBytes)}
              </span>
              <span className="text-[11px] text-[#86868B]">({quota.objectCount} 文件)</span>
            </div>
            <div className="w-36 h-2 bg-[#767680]/[0.14] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  quota.usageRatio > 0.85 ? 'bg-[#FF3B30]' : 'bg-[#007AFF]'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, quota.usageRatio * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* iPadOS 分段胶囊页签 */}
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="grid grid-cols-3 bg-[#767680]/[0.11] p-[3px] rounded-full text-[12px]">
            <button
              type="button"
              onClick={() => setTab('tokens')}
              className={`py-1.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                tab === 'tokens'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>API 密钥 ({tokens.filter((t) => !t.revokedAt).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('webhooks')}
              className={`py-1.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                tab === 'webhooks'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <Webhook className="w-3.5 h-3.5" />
              <span>Webhooks ({webhooks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('guides')}
              className={`py-1.5 rounded-full font-semibold flex items-center justify-center gap-1.5 transition-all ${
                tab === 'guides'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>MCP & n8n 代码</span>
            </button>
          </div>
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'tokens' && (
            <>
              {newlyCreatedToken && (
                <div className="p-4 rounded-[18px] bg-[#34C759]/12 border border-[#34C759]/25 space-y-2">
                  <div className="text-[12px] font-semibold text-[#1E823C]">
                    密钥签发成功！请立即复制保存（此后仅展示脱敏前缀）：
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded-[10px] text-[12px] font-mono text-[#1D1D1F] break-all">
                      {newlyCreatedToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText('new_tok', newlyCreatedToken)}
                      className="px-3.5 py-2 rounded-full bg-[#34C759] text-white text-[12px] font-semibold shrink-0 ios-press"
                    >
                      {copiedId === 'new_tok' ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleCreateToken}
                className="bg-white rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3"
              >
                <div className="text-[13px] font-semibold text-[#1D1D1F]">签发新 API Token</div>
                <input
                  type="text"
                  required
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="用途命名，如：n8n 生产同步 / OpenClaw MCP"
                  className="w-full px-3.5 py-2 text-[13px] bg-[#F2F2F7] rounded-[11px] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30"
                />
                <div className="flex flex-wrap gap-2">
                  {API_SCOPES.map((sc) => {
                    const checked = selectedScopes.includes(sc);
                    return (
                      <div
                        key={sc}
                        className="px-2.5 py-1 rounded-full bg-[#F2F2F7]"
                      >
                        <IOSCheckbox
                          checked={checked}
                          label={API_SCOPE_LABELS[sc]}
                          onChange={() =>
                            setSelectedScopes((prev) =>
                              checked ? prev.filter((x) => x !== sc) : [...prev, sc],
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-[12px] font-semibold flex items-center gap-1 ios-press"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>生成 Token</span>
                  </button>
                </div>
              </form>

              <div className="bg-white rounded-[18px] divide-y divide-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                {tokens.length === 0 ? (
                  <div className="p-6 text-center text-[12px] text-[#86868B]">尚未签发任何 API Token</div>
                ) : (
                  tokens.map((tok) => (
                    <div key={tok.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#1D1D1F]">{tok.name}</span>
                          {tok.revokedAt ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FF3B30]/12 text-[#C8231C]">
                              已吊销
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#34C759]/14 text-[#1E823C]">
                              生效中
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#86868B]">{tok.tokenPrefix}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {tok.scopes.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[#767680]/10 text-[#48484A] font-mono"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      {!tok.revokedAt && (
                        <button
                          type="button"
                          onClick={() => void api.revokeToken(tok.id).then(loadAll)}
                          className="px-3 py-1 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/18 text-[12px] font-semibold shrink-0 ios-press"
                        >
                          吊销
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {tab === 'webhooks' && (
            <>
              <form
                onSubmit={handleCreateWebhook}
                className="bg-white rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3"
              >
                <div className="text-[13px] font-semibold text-[#1D1D1F]">
                  新建 Webhook 订阅（Queues 可靠投递）
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="订阅名称，如：n8n 内容自动发布"
                    className="px-3 py-2 text-[12px] bg-[#F2F2F7] rounded-[11px] focus:outline-none"
                  />
                  <input
                    type="url"
                    required
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/..."
                    className="px-3 py-2 text-[12px] bg-[#F2F2F7] rounded-[11px] focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {AUTOMATION_EVENT_TYPES.filter((e) => e !== 'webhook.test').map((evt) => {
                    const checked = whEvents.includes(evt);
                    return (
                      <div key={evt} className="px-2.5 py-1 rounded-full bg-[#F2F2F7] font-mono">
                        <IOSCheckbox
                          checked={checked}
                          label={evt}
                          onChange={() =>
                            setWhEvents((prev) =>
                              checked ? prev.filter((x) => x !== evt) : [...prev, evt],
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!activeBaseId}
                    className="px-4 py-1.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-[12px] font-semibold ios-press"
                  >
                    添加订阅
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {webhooks.map((wh) => {
                  const logs = logsByWebhook[wh.id] ?? [];
                  return (
                    <div
                      key={wh.id}
                      className="bg-white rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[#1D1D1F]">{wh.name}</div>
                          <div className="text-[11px] font-mono text-[#86868B] truncate">
                            {wh.targetUrl}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] pt-0.5">
                            <span className="text-[#86868B]">HMAC 密钥:</span>
                            <code className="bg-[#F2F2F7] px-2 py-0.5 rounded-full text-[#1D1D1F]">
                              {wh.secret.slice(0, 12)}...
                            </code>
                            <button
                              type="button"
                              onClick={() => copyText(wh.id, wh.secret)}
                              className="text-[#007AFF] font-medium hover:underline"
                            >
                              {copiedId === wh.id ? '已复制' : '复制密钥'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <IOSSwitch
                            checked={wh.enabled}
                            onChange={(next) => void api.toggleWebhook(wh.id, next).then(loadAll)}
                          />
                          <button
                            type="button"
                            disabled={testingWhId === wh.id}
                            onClick={() => void handleTestWebhook(wh.id)}
                            className="px-3 py-1.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-semibold flex items-center gap-1 ios-press"
                          >
                            <Play className="w-3 h-3" />
                            <span>{testingWhId === wh.id ? '发送中' : 'Ping'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void api
                                .listWebhookDeliveries(wh.id)
                                .then((res) => setLogsByWebhook((p) => ({ ...p, [wh.id]: res })))
                            }
                            className="px-2.5 py-1.5 rounded-full bg-[#F2F2F7] text-[11px] font-medium text-[#1D1D1F]"
                          >
                            日志
                          </button>
                          <button
                            type="button"
                            onClick={() => void api.deleteWebhook(wh.id).then(loadAll)}
                            className="p-1.5 rounded-full text-[#86868B] hover:text-[#FF3B30]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {logs.length > 0 && (
                        <div className="bg-[#F2F2F7] rounded-[12px] p-3 space-y-1 text-[11px] font-mono">
                          {logs.slice(0, 5).map((log) => (
                            <div key={log.id} className="flex items-center justify-between gap-2">
                              <span className="text-[#1D1D1F] truncate">
                                [{log.eventType}] HTTP {log.statusCode ?? 'ERR'} · {log.durationMs}ms
                              </span>
                              <span className="text-[#FF3B30] truncate">{log.errorMessage}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'guides' && (
            <div className="space-y-4">
              <div className="bg-white rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-[#1D1D1F]">
                    1. n8n / HTTP 幂等 Upsert 调用示例（中文列名直写）
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyText('curl', curlSnippet)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#007AFF]/10 text-[11px] font-semibold text-[#007AFF]"
                  >
                    {copiedId === 'curl' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === 'curl' ? '已复制' : '复制 cURL'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-[14px] bg-[#1D1D1F] text-[#F2F2F7] text-[11px] overflow-x-auto leading-relaxed">
                  {curlSnippet}
                </pre>
              </div>

              <div className="bg-white rounded-[18px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-[#1D1D1F]">
                    2. AI Agents 原生 MCP Server 配置
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyText('mcp', mcpSnippet)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#007AFF]/10 text-[11px] font-semibold text-[#007AFF]"
                  >
                    {copiedId === 'mcp' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === 'mcp' ? '已复制' : '复制 JSON'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-[14px] bg-[#1D1D1F] text-[#F2F2F7] text-[11px] overflow-x-auto leading-relaxed">
                  {mcpSnippet}
                </pre>
                <p className="text-[11px] text-[#86868B] leading-relaxed">
                  内置 8 大 MCP 工具：<code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">list_bases</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">get_base_schema</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">query_records</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">create_records</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">upsert_records</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">update_record</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">delete_records</code>{' '}
                  <code className="bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">create_field</code>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
