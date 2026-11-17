import { describe, expect, it } from 'vitest';
import { generateId, type ActorInfo, type StorageQuota } from '@flaretable/shared';
import { signWebhookPayload, verifyWebhookSignature } from '../src/utils/crypto.js';
import { assertQuotaAllowsUpload } from '../src/control-plane/storage-guard.js';
import { BaseService } from '../src/base-engine/base-service.js';
import { handleMcpHttpRequest, type McpEngineAdapter } from '../src/mcp/server.js';
import type { AuthPrincipal } from '../src/middleware/auth.js';
import { NodeSqlDriver } from './node-sql-driver.js';

describe('自动化安全与原生 MCP Server 协议测试', () => {
  it('能正确计算并恒定时间校验 Webhook HMAC-SHA256 签名', async () => {
    const secret = 'whsec_test_secret_123456';
    const ts = '1763345434';
    const rawBody = JSON.stringify({ eventType: 'record.created', baseId: 'base_1' });

    const sig = await signWebhookPayload(secret, ts, rawBody);
    expect(sig.startsWith('sha256=')).toBe(true);
    expect(await verifyWebhookSignature(secret, ts, rawBody, sig)).toBe(true);

    // 篡改正文或时间戳必须验签失败
    expect(await verifyWebhookSignature(secret, ts, `${rawBody} `, sig)).toBe(false);
    expect(await verifyWebhookSignature(secret, '1763345435', rawBody, sig)).toBe(false);
  });

  it('R2 硬熔断配额守卫能拦截超限单文件及总配额溢出', () => {
    const baseQuota: StorageQuota = {
      usedBytes: 2 * 1024 * 1024 * 1024 - 1024, // 距离 2GB 仅剩 1KB
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
      maxFileBytes: 25 * 1024 * 1024,
      objectCount: 42,
      usageRatio: 0.9999,
    };

    // 512 字节正常放行
    expect(() => assertQuotaAllowsUpload(baseQuota, 512)).not.toThrow();

    // 2048 字节触发 2GB 全局硬熔断
    expect(() => assertQuotaAllowsUpload(baseQuota, 2048)).toThrow(/硬熔断保护/);

    // 单文件超过 25MB 限制触发拒绝
    const emptyQuota: StorageQuota = { ...baseQuota, usedBytes: 0, usageRatio: 0 };
    expect(() => assertQuotaAllowsUpload(emptyQuota, 26 * 1024 * 1024)).toThrow(/单个附件体积超过限制/);
  });

  it('原生 MCP Streamable HTTP 端点支持 initialize、tools/list 与 tools/call 全流程且强制校验 Scope', async () => {
    const driver = new NodeSqlDriver();
    const baseId = generateId('base');
    const service = new BaseService(baseId, driver);
    const sysActor: ActorInfo = { type: 'system', label: '测试建表' };
    const memTable = service.createTable({ name: 'Agent 任务记忆库', primaryFieldName: '任务摘要' });
    service.createField(memTable.id, { name: '任务唯一键', type: 'text' }, sysActor);
    service.createField(memTable.id, { name: '执行状态', type: 'single_select' }, sysActor);
    service.createField(memTable.id, { name: '智能体名称', type: 'text' }, sysActor);
    service.createField(memTable.id, { name: '置信度评分', type: 'number' }, sysActor);

    const adapter: McpEngineAdapter = {
      listBases: async () => [
        {
          id: baseId,
          name: 'Agent 记忆库',
          description: '',
          icon: 'bot',
          templateKey: 'agent_memory',
          tableCount: 1,
          createdAt: '2026-11-16T00:00:00Z',
          updatedAt: '2026-11-16T00:00:00Z',
        },
      ],
      getBaseSchema: async () => service.getFullSchema(),
      queryRecords: async (_b, tbl, opts) => service.queryRecords(tbl, opts),
      createRecords: async (_b, tbl, input, actor) =>
        service.createRecords(tbl, input.records, input.fieldKeyType ?? 'name', actor).data,
      upsertRecords: async (_b, tbl, input, actor) =>
        service.upsertRecords(tbl, input.matchField, input.records, input.fieldKeyType ?? 'name', actor).data,
      updateRecord: async (_b, tbl, recId, fields, keyType, actor) =>
        service.updateRecords(tbl, [{ id: recId, fields }], keyType, actor).data,
      deleteRecords: async (_b, tbl, ids, actor) => service.deleteRecords(tbl, ids, actor).data,
      createField: async (_b, tbl, input, actor) => service.createField(tbl, input, actor).data,
    };

    const readWritePrincipal: AuthPrincipal = {
      mode: 'api_token',
      actor: { type: 'api_token', id: 'tok_1', label: 'Token:OpenClaw' } as ActorInfo,
      token: {
        id: 'tok_1',
        name: 'OpenClaw',
        tokenPrefix: 'ft_live_xxx',
        scopes: ['base:read', 'records:read', 'records:write'],
        baseIds: [],
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-11-16T00:00:00Z',
        lastUsedAt: null,
      },
    };

    const callMcp = async (payload: unknown) => {
      const req = new Request('https://example.workers.dev/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await handleMcpHttpRequest(req, {
        authenticate: async () => readWritePrincipal,
        adapter,
      });
      return res;
    };

    // 1. initialize
    const initRes = await callMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });
    const initJson = (await initRes.json()) as { result: { serverInfo: { name: string } } };
    expect(initJson.result.serverInfo.name).toBe('flaretable-mcp');

    // 2. tools/list
    const listRes = await callMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listJson = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
    expect(listJson.result.tools).toHaveLength(8);

    // 3. tools/call upsert_records
    const upsertRes = await callMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'upsert_records',
        arguments: {
          baseId,
          tableId: 'Agent 任务记忆库',
          matchField: '任务唯一键',
          records: [
            {
              fields: {
                任务唯一键: 'mcp-test-01',
                任务摘要: '由 MCP 工具直接写入的新记忆',
                执行状态: '已沉淀',
                智能体名称: 'openclaw',
                置信度评分: 0.96,
              },
            },
          ],
        },
      },
    });
    const upsertJson = (await upsertRes.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(upsertJson.result.isError).toBe(false);
    expect(upsertJson.result.content[0]!.text).toContain('"createdCount": 1');

    // 4. 验证无 schema:write 权限的 Token 调用 create_field 时被拒绝
    const deniedRes = await callMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'create_field',
        arguments: {
          baseId,
          tableId: 'Agent 任务记忆库',
          name: '违规新增列',
          type: 'text',
        },
      },
    });
    const deniedJson = (await deniedRes.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(deniedJson.result.isError).toBe(true);
    expect(deniedJson.result.content[0]!.text).toContain('schema:write');
  });
});
