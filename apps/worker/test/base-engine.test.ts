import { describe, expect, it } from 'vitest';
import type { ActorInfo } from '@flaretable/shared';
import { BaseService } from '../src/base-engine/base-service.js';
import { NodeSqlDriver } from './node-sql-driver.js';

const TEST_ACTOR: ActorInfo = { type: 'web', label: '测试管理员' };

function setupSampleContentBase(service: BaseService) {
  const channelsTable = service.createTable({
    name: '发布渠道矩阵',
    primaryFieldName: '渠道名称',
  });
  const weightField = service.createField(
    channelsTable.id,
    { name: '曝光权重', type: 'number', options: { precision: 1 } },
    TEST_ACTOR,
  ).data;

  const channelRecs = service.createRecords(
    channelsTable.id,
    [
      { fields: { 渠道名称: '微信公众号', [weightField.name]: 1.5 } },
      { fields: { 渠道名称: 'X / Twitter', [weightField.name]: 1.2 } },
    ],
    'name',
    TEST_ACTOR,
  ).data;

  const contentTable = service.createTable({
    name: '内容排期表',
    primaryFieldName: '文章标题',
  });
  service.createField(contentTable.id, { name: '预估基础阅读', type: 'number' }, TEST_ACTOR);
  service.createField(contentTable.id, { name: '是否同步发推', type: 'checkbox' }, TEST_ACTOR);
  service.createField(contentTable.id, { name: '外部唯一ID', type: 'text' }, TEST_ACTOR);

  const linkField = service.createField(
    contentTable.id,
    {
      name: '主发布渠道',
      type: 'link',
      options: { targetTableId: channelsTable.id, allowMultiple: false },
    },
    TEST_ACTOR,
  ).data;

  const lookupWeight = service.createField(
    contentTable.id,
    {
      name: '渠道权重系数',
      type: 'lookup',
      options: { linkFieldId: linkField.id, targetFieldId: weightField.id },
    },
    TEST_ACTOR,
  ).data;

  service.createField(
    contentTable.id,
    {
      name: '加权预期曝光',
      type: 'formula',
      options: {
        expression: `ROUND({预估基础阅读} * COALESCE({${lookupWeight.name}}, 1), 0)`,
      },
    },
    TEST_ACTOR,
  );

  service.createRecords(
    contentTable.id,
    [
      {
        fields: {
          文章标题: 'Cloudflare Workers Paid 实战指南',
          预估基础阅读: 4200,
          是否同步发推: true,
          外部唯一ID: 'post-cf-01',
          主发布渠道: [channelRecs[0]!.id],
        },
      },
      {
        fields: {
          文章标题: 'OpenClaw MCP 接入实践',
          预估基础阅读: 2800,
          是否同步发推: false,
          外部唯一ID: 'post-mcp-02',
          主发布渠道: [channelRecs[1]!.id],
        },
      },
    ],
    'name',
    TEST_ACTOR,
  );

  return { channelsTable, contentTable };
}

describe('多维表格核心引擎 (BaseService)', () => {
  it('新建空间默认初始化纯净空白数据表 1（含3个基础空列且 0 条记录）', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_blank', driver);
    const init = service.initBlankBase();

    expect(init.tableCount).toBe(1);
    expect(init.tables[0]!.name).toBe('数据表 1');
    expect(init.tables[0]!.fields.map((f) => f.name)).toEqual(['文本', '单选', '日期']);
    expect(init.tables[0]!.views[0]!.name).toBe('表格视图');

    const res = service.queryRecords(init.tables[0]!.id);
    expect(res.total).toBe(0);
    expect(res.records).toEqual([]);
  });

  it('支持表重命名、视图删除以及最后一个表/视图保护', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_manage', driver);
    const init = service.initBlankBase();
    const tbl = init.tables[0]!;

    const renamed = service.updateTable(tbl.id, { name: '客户线索表' });
    expect(renamed.name).toBe('客户线索表');

    // 最后一张表不可删除
    expect(() => service.deleteTable(tbl.id)).toThrow(/至少需要保留一张数据表/);

    // 最后一个视图不可删除，新建第 2 个视图后可删除
    const firstView = tbl.views[0]!;
    expect(() => service.deleteView(tbl.id, firstView.id)).toThrow(/至少需要保留一个视图/);

    const kanbanView = service.createView(tbl.id, { name: '看板', type: 'kanban' });
    service.deleteView(tbl.id, kanbanView.id);
    expect(service.listViews(tbl.id)).toHaveLength(1);
  });

  it('能正确水合关联 Lookup 与公式计算列', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_demo', driver);
    const { contentTable } = setupSampleContentBase(service);

    const query = service.queryRecords(contentTable.id, {
      fieldKeyType: 'name',
      sorts: [{ field: '预估基础阅读', direction: 'desc' }],
    });

    expect(query.total).toBe(2);
    const top = query.records[0]!;
    expect(top.fieldsByName['渠道权重系数']).toBe(1.5);
    expect(top.fieldsByName['加权预期曝光']).toBe(6300);
  });

  it('支持按字段名进行结构化 FilterGroup 筛选与全文搜索', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_filter', driver);
    const { contentTable } = setupSampleContentBase(service);

    const res = service.queryRecords(contentTable.id, {
      fieldKeyType: 'name',
      filter: {
        conjunction: 'and',
        conditions: [
          { field: '是否同步发推', operator: 'eq', value: true },
          { field: '预估基础阅读', operator: 'gte', value: 3000 },
        ],
      },
    });

    expect(res.total).toBe(1);
    expect(res.records[0]!.fieldsByName['外部唯一ID']).toBe('post-cf-01');

    const searchRes = service.queryRecords(contentTable.id, { search: 'openclaw' });
    expect(searchRes.total).toBe(1);
    expect(searchRes.records[0]!.fieldsByName['外部唯一ID']).toBe('post-mcp-02');
  });

  it('支持基于业务唯一键的幂等 Upsert（重复执行不产生重复行）', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_upsert', driver);
    const { contentTable } = setupSampleContentBase(service);

    const first = service.upsertRecords(
      contentTable.id,
      '外部唯一ID',
      [
        {
          fields: {
            外部唯一ID: 'rss-item-999',
            文章标题: '初始抓取标题',
            预估基础阅读: 1000,
          },
        },
      ],
      'name',
      TEST_ACTOR,
    );

    expect(first.data.createdCount).toBe(1);
    expect(first.data.updatedCount).toBe(0);
    const createdId = first.data.records[0]!.record.id;

    const second = service.upsertRecords(
      contentTable.id,
      '外部唯一ID',
      [
        {
          fields: {
            外部唯一ID: 'rss-item-999',
            预估基础阅读: 2500,
          },
        },
      ],
      'name',
      TEST_ACTOR,
    );

    expect(second.data.createdCount).toBe(0);
    expect(second.data.updatedCount).toBe(1);
    expect(second.data.records[0]!.record.id).toBe(createdId);
    expect(second.data.records[0]!.record.version).toBe(2);
    expect(second.data.records[0]!.record.fieldsByName['文章标题']).toBe('初始抓取标题');
  });

  it('支持跨表双向 Link 关联及删除目标记录时的级联边清理', () => {
    const driver = new NodeSqlDriver();
    const service = new BaseService('base_link', driver);

    const projectTbl = service.createTable({ name: '项目表', primaryFieldName: '项目名' });
    const taskTbl = service.createTable({ name: '任务表', primaryFieldName: '任务名' });

    const linkField = service.createField(
      taskTbl.id,
      {
        name: '所属项目',
        type: 'link',
        options: { targetTableId: projectTbl.id, allowMultiple: false },
      },
      TEST_ACTOR,
    ).data;

    expect(linkField.options.symmetricFieldId).toBeTruthy();

    const p1 = service.createRecords(
      projectTbl.id,
      [{ fields: { 项目名: 'FlareTable v1' } }],
      'name',
      TEST_ACTOR,
    ).data[0]!;

    const t1 = service.createRecords(
      taskTbl.id,
      [{ fields: { 任务名: '实现 MCP Server', 所属项目: [p1.id] } }],
      'name',
      TEST_ACTOR,
    ).data[0]!;

    const p1Reloaded = service.getRecordOrThrow(projectTbl.id, p1.id);
    const symFieldId = linkField.options.symmetricFieldId!;
    expect(p1Reloaded.fields[symFieldId]).toEqual([t1.id]);

    service.deleteRecords(taskTbl.id, [t1.id], TEST_ACTOR);
    const p1AfterDelete = service.getRecordOrThrow(projectTbl.id, p1.id);
    expect(p1AfterDelete.fields[symFieldId]).toEqual([]);
  });
});
