import type {
  ApiScope,
  AttachmentItem,
  AutomationEventType,
  BaseDetail,
  BaseSummary,
  FieldMeta,
  FieldOptions,
  FieldType,
  FilterGroup,
  FormTheme,
  RecordItem,
  SortSpec,
  StorageQuota,
  TableMeta,
  TableWithSchema,
  ViewConfig,
  ViewMeta,
  ViewType,
} from '@flaretable/shared';

export interface ApiTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiScope[];
  baseIds: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebhookItem {
  id: string;
  baseId: string;
  name: string;
  targetUrl: string;
  secret: string;
  events: AutomationEventType[];
  enabled: boolean;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  statusCode: number | null;
  durationMs: number;
  attempt: number;
  responseSnippet: string;
  errorMessage: string;
  createdAt: string;
}

export interface PublicFormInfo {
  shareToken: string;
  title: string;
  description: string;
  theme: FormTheme;
  submitText: string;
  successMessage: string;
  allowResubmit: boolean;
  requiredFieldIds: string[];
  fieldHints: Record<string, string>;
  tableName: string;
  fields: FieldMeta[];
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function getPasscodeHeader(): Record<string, string> {
  const code = localStorage.getItem('flaretable_admin_passcode');
  return code ? { 'X-Admin-Passcode': code } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...getPasscodeHeader(),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...init, headers });
  const json = (await res.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string } };

  if (!res.ok || !json.ok) {
    const errObj = !json.ok ? json.error : { code: 'HTTP_ERROR', message: `请求失败 (${res.status})` };
    throw new ApiClientError(res.status, errObj.code, errObj.message);
  }
  return json.data;
}

export const api = {
  // 空间 Bases
  listBases: () => request<BaseSummary[]>('/api/v1/bases'),
  getBase: (baseId: string) => request<BaseDetail>(`/api/v1/bases/${baseId}`),
  createBase: (body: { name: string; description?: string; icon?: string }) =>
    request<BaseDetail>('/api/v1/bases', { method: 'POST', body: JSON.stringify(body) }),
  updateBase: (baseId: string, body: { name?: string; description?: string }) =>
    request<BaseSummary>(`/api/v1/bases/${baseId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteBase: (baseId: string) =>
    request<{ deleted: boolean }>(`/api/v1/bases/${baseId}`, { method: 'DELETE' }),

  // 表与字段视图 Schema
  createTable: (
    baseId: string,
    body: {
      name: string;
      description?: string;
      primaryFieldName?: string;
      includeStarterFields?: boolean;
    },
  ) =>
    request<TableWithSchema>(`/api/v1/bases/${baseId}/tables`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTable: (baseId: string, tableId: string, body: { name: string; description?: string }) =>
    request<TableMeta>(`/api/v1/bases/${baseId}/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteTable: (baseId: string, tableId: string) =>
    request<{ deleted: boolean }>(`/api/v1/bases/${baseId}/tables/${tableId}`, { method: 'DELETE' }),
  createField: (
    baseId: string,
    tableId: string,
    body: { name: string; type: FieldType; options?: FieldOptions },
  ) =>
    request<FieldMeta>(`/api/v1/bases/${baseId}/tables/${tableId}/fields`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateField: (
    baseId: string,
    tableId: string,
    fieldId: string,
    body: { name?: string; options?: FieldOptions },
  ) =>
    request<FieldMeta>(`/api/v1/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteField: (baseId: string, tableId: string, fieldId: string) =>
    request<{ deleted: boolean }>(`/api/v1/bases/${baseId}/tables/${tableId}/fields/${fieldId}`, {
      method: 'DELETE',
    }),
  createView: (
    baseId: string,
    tableId: string,
    body: { name: string; type: ViewType; config?: ViewConfig },
  ) =>
    request<ViewMeta>(`/api/v1/bases/${baseId}/tables/${tableId}/views`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateView: (
    baseId: string,
    tableId: string,
    viewId: string,
    body: { name?: string; config?: ViewConfig },
  ) =>
    request<ViewMeta>(`/api/v1/bases/${baseId}/tables/${tableId}/views/${viewId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteView: (baseId: string, tableId: string, viewId: string) =>
    request<{ deleted: boolean }>(`/api/v1/bases/${baseId}/tables/${tableId}/views/${viewId}`, {
      method: 'DELETE',
    }),

  // 记录读写与筛选查询
  queryRecords: (
    baseId: string,
    tableId: string,
    body: {
      filter?: FilterGroup;
      sorts?: SortSpec[];
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) =>
    request<{ total: number; records: RecordItem[] }>(
      `/api/v1/bases/${baseId}/tables/${tableId}/records/query`,
      {
        method: 'POST',
        body: JSON.stringify({ fieldKeyType: 'id', ...body }),
      },
    ),
  createRecord: (baseId: string, tableId: string, fields: Record<string, unknown>) =>
    request<{ records: RecordItem[] }>(`/api/v1/bases/${baseId}/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ fieldKeyType: 'id', records: [{ fields }] }),
    }),
  updateRecord: (baseId: string, tableId: string, id: string, fields: Record<string, unknown>) =>
    request<{ records: RecordItem[] }>(`/api/v1/bases/${baseId}/tables/${tableId}/records`, {
      method: 'PATCH',
      body: JSON.stringify({ fieldKeyType: 'id', records: [{ id, fields }] }),
    }),
  deleteRecords: (baseId: string, tableId: string, recordIds: string[]) =>
    request<{ deletedIds: string[] }>(`/api/v1/bases/${baseId}/tables/${tableId}/records`, {
      method: 'DELETE',
      body: JSON.stringify({ recordIds }),
    }),

  // 公开表单
  getPublicForm: (shareToken: string) => request<PublicFormInfo>(`/api/v1/public/forms/${shareToken}`),
  submitPublicForm: (shareToken: string, fields: Record<string, unknown>) =>
    request<{ record: RecordItem }>(`/api/v1/public/forms/${shareToken}/submit`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    }),

  // 附件与 R2 配额
  getStorageQuota: () => request<StorageQuota>('/api/v1/storage/quota'),
  uploadAttachment: (baseId: string, file: File, tableId?: string, recordId?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (tableId) fd.append('tableId', tableId);
    if (recordId) fd.append('recordId', recordId);
    return request<{ attachment: AttachmentItem; quota: StorageQuota }>(
      `/api/v1/bases/${baseId}/attachments`,
      { method: 'POST', body: fd },
    );
  },

  // 自动化：Token 与 Webhook
  listTokens: () => request<ApiTokenItem[]>('/api/v1/tokens'),
  createToken: (body: { name: string; scopes: ApiScope[]; baseIds?: string[]; expiresInDays?: number }) =>
    request<{ token: ApiTokenItem; plainTextToken: string }>('/api/v1/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeToken: (tokenId: string) =>
    request<{ revoked: boolean }>(`/api/v1/tokens/${tokenId}`, { method: 'DELETE' }),
  listWebhooks: (baseId?: string) =>
    request<WebhookItem[]>(baseId ? `/api/v1/webhooks?baseId=${encodeURIComponent(baseId)}` : '/api/v1/webhooks'),
  createWebhook: (body: {
    baseId: string;
    name: string;
    targetUrl: string;
    events: AutomationEventType[];
  }) =>
    request<WebhookItem>('/api/v1/webhooks', { method: 'POST', body: JSON.stringify(body) }),
  toggleWebhook: (webhookId: string, enabled: boolean) =>
    request<WebhookItem>(`/api/v1/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  deleteWebhook: (webhookId: string) =>
    request<{ deleted: boolean }>(`/api/v1/webhooks/${webhookId}`, { method: 'DELETE' }),
  testWebhook: (webhookId: string) =>
    request<WebhookDeliveryLog>(`/api/v1/webhooks/${webhookId}/test`, { method: 'POST' }),
  listWebhookDeliveries: (webhookId: string) =>
    request<WebhookDeliveryLog[]>(`/api/v1/webhooks/${webhookId}/deliveries`),
};
