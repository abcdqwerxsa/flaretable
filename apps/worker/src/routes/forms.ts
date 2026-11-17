import { createRoute, z } from '@hono/zod-openapi';
import {
  COMPUTED_FIELD_TYPES,
  FieldMetaSchema,
  FORM_THEMES,
  RecordItemSchema,
  type FieldMeta,
  type RecordItem,
  type TableWithSchema,
} from '@flaretable/shared';
import { getPublicFormRouteOrThrow } from '../control-plane/workspace-service.js';
import { callBaseEngine } from '../durable-objects/do-client.js';
import { AppError } from '../utils/response.js';
import type { AppOpenAPI } from './bases.js';

function resolveExposedFormFields(table: TableWithSchema, configuredIds?: string[]): FieldMeta[] {
  const editableFields = table.fields.filter(
    (f) => !COMPUTED_FIELD_TYPES.has(f.type) && f.type !== 'link' && f.type !== 'attachment',
  );
  if (!configuredIds || configuredIds.length === 0) {
    return editableFields;
  }
  const byId = new Map(editableFields.map((f) => [f.id, f]));
  return configuredIds.map((id) => byId.get(id)).filter((f): f is FieldMeta => Boolean(f));
}

export function registerPublicFormRoutes(app: AppOpenAPI): void {
  // 1. 公开读取表单定义与外观配置（无需认证）
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/v1/public/forms/{shareToken}',
      tags: ['公开表单 (Public Forms)'],
      summary: '获取对外公开收集表单的完整配置与字段结构',
      request: {
        params: z.object({ shareToken: z.string() }),
      },
      responses: {
        200: {
          description: '公开表单渲染元数据',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({
                  shareToken: z.string(),
                  title: z.string(),
                  description: z.string(),
                  theme: z.enum(FORM_THEMES),
                  submitText: z.string(),
                  successMessage: z.string(),
                  allowResubmit: z.boolean(),
                  requiredFieldIds: z.array(z.string()),
                  fieldHints: z.record(z.string(), z.string()),
                  tableName: z.string(),
                  fields: z.array(FieldMetaSchema),
                }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { shareToken } = c.req.valid('param');
      const route = await getPublicFormRouteOrThrow(c.env.CONTROL_DB, shareToken);
      if (!route.enabled) {
        throw new AppError(403, 'PUBLIC_FORM_DISABLED', '该公开表单已暂停收集');
      }

      const tables = await callBaseEngine<TableWithSchema[]>(c.env, {
        op: 'getSchema',
        baseId: route.baseId,
      });
      const table = tables.find((t) => t.id === route.tableId);
      if (!table) {
        throw new AppError(404, 'TABLE_NOT_FOUND', '表单关联的数据表不存在');
      }

      const view = table.views.find((v) => v.id === route.viewId);
      const exposedFields = resolveExposedFormFields(table, view?.config.formFieldIds);

      return c.json(
        {
          ok: true as const,
          data: {
            shareToken: route.shareToken,
            title: view?.config.formTitle || route.title || view?.name || table.name,
            description: view?.config.formDescription ?? route.description ?? '',
            theme: view?.config.formTheme ?? 'blue',
            submitText: view?.config.formSubmitText || '提交',
            successMessage: view?.config.formSuccessMessage || '感谢填写，您的内容已成功录入系统。',
            allowResubmit: view?.config.formAllowResubmit ?? true,
            requiredFieldIds: view?.config.formRequiredFieldIds ?? [table.primaryFieldId],
            fieldHints: view?.config.formFieldHints ?? {},
            tableName: table.name,
            fields: exposedFields,
          },
        },
        200,
      );
    },
  );

  // 2. 匿名提交公开表单（带必填校验，写入表记录并触发 form.submitted 事件）
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/v1/public/forms/{shareToken}/submit',
      tags: ['公开表单 (Public Forms)'],
      summary: '提交公开表单数据并入库',
      request: {
        params: z.object({ shareToken: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                fields: z.record(z.string(), z.unknown()),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: '提交入库成功的记录',
          content: {
            'application/json': {
              schema: z.object({
                ok: z.literal(true),
                data: z.object({ record: RecordItemSchema }),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const { shareToken } = c.req.valid('param');
      const body = c.req.valid('json');
      const route = await getPublicFormRouteOrThrow(c.env.CONTROL_DB, shareToken);
      if (!route.enabled) {
        throw new AppError(403, 'PUBLIC_FORM_DISABLED', '该公开表单已暂停收集');
      }

      const tables = await callBaseEngine<TableWithSchema[]>(c.env, {
        op: 'getSchema',
        baseId: route.baseId,
      });
      const table = tables.find((t) => t.id === route.tableId);
      if (!table) {
        throw new AppError(404, 'TABLE_NOT_FOUND', '表单关联的数据表不存在');
      }

      const view = table.views.find((v) => v.id === route.viewId);
      const exposedFields = resolveExposedFormFields(table, view?.config.formFieldIds);
      const exposedIdSet = new Set(exposedFields.map((f) => f.id));
      const requiredIds = new Set(view?.config.formRequiredFieldIds ?? [table.primaryFieldId]);

      // 只允许提交表单配置暴露的字段，并严格校验必填项
      const sanitizedFields: Record<string, unknown> = {};
      for (const field of exposedFields) {
        const val = body.fields[field.id];
        if (requiredIds.has(field.id)) {
          const isMissing =
            val === undefined ||
            val === null ||
            val === '' ||
            (Array.isArray(val) && val.length === 0) ||
            (field.type === 'checkbox' && val !== true);
          if (isMissing) {
            throw new AppError(400, 'REQUIRED_FIELD_MISSING', `请填写必填项「${field.name}」`);
          }
        }
        if (field.id in body.fields && exposedIdSet.has(field.id)) {
          sanitizedFields[field.id] = val;
        }
      }

      const created = await callBaseEngine<RecordItem[]>(c.env, {
        op: 'createRecords',
        baseId: route.baseId,
        tableId: route.tableId,
        records: [{ fields: sanitizedFields }],
        fieldKeyType: 'id',
        actor: {
          type: 'public_form',
          id: shareToken,
          label: `公开表单:${view?.config.formTitle || route.title || shareToken}`,
        },
      });

      return c.json({ ok: true as const, data: { record: created[0]! } }, 201);
    },
  );
}
