import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BaseDetail,
  BaseSummary,
  FieldMeta,
  FieldOptions,
  FieldType,
  FilterGroup,
  RecordItem,
  SortSpec,
  ViewConfig,
  ViewType,
} from '@flaretable/shared';
import { Lock, Plus, Table2 } from 'lucide-react';
import { api, ApiClientError } from './lib/api.js';
import { useBaseRealtime } from './lib/realtime.js';
import { IOSSquircleIcon } from './components/AppleUI.js';
import { Sidebar } from './components/Sidebar.js';
import { ViewHeader } from './components/ViewHeader.js';
import { GridView } from './components/GridView.js';
import { KanbanView } from './components/KanbanView.js';
import { GalleryView } from './components/GalleryView.js';
import { FormView, PublicFormPage } from './components/FormView.js';
import { FieldModal } from './components/FieldModal.js';
import { RecordDrawer } from './components/RecordDrawer.js';
import { AutomationDrawer } from './components/AutomationDrawer.js';

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/f/')) {
    const shareToken = path.slice(3).split('/')[0] ?? '';
    if (shareToken) {
      return <PublicFormPage shareToken={shareToken} />;
    }
  }

  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const [bases, setBases] = useState<BaseSummary[]>([]);
  const [activeBase, setActiveBase] = useState<BaseDetail | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [linkedRecordMap, setLinkedRecordMap] = useState<Record<string, string>>({});

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterGroup>({ conjunction: 'and', conditions: [] });
  const [sorts, setSorts] = useState<SortSpec[]>([]);
  const [showFieldIds, setShowFieldIds] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [errorToast, setErrorToast] = useState('');

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<FieldMeta | null>(null);
  const [drawerRecord, setDrawerRecord] = useState<RecordItem | null>(null);
  const [showAutomation, setShowAutomation] = useState(false);

  const autoBootstrappedRef = useRef(false);

  const activeTable = useMemo(
    () => activeBase?.tables.find((t) => t.id === activeTableId) ?? activeBase?.tables[0] ?? null,
    [activeBase, activeTableId],
  );

  const activeView = useMemo(
    () => activeTable?.views.find((v) => v.id === activeViewId) ?? activeTable?.views[0] ?? null,
    [activeTable, activeViewId],
  );

  const showError = (err: unknown) => {
    if (err instanceof ApiClientError && err.status === 401) {
      setAuthNeeded(true);
      return;
    }
    const msg = err instanceof Error ? err.message : '操作失败';
    setErrorToast(msg);
    setTimeout(() => setErrorToast(''), 4000);
  };

  const loadBaseDetail = useCallback(
    async (baseId: string, preferredTableId?: string, preferredViewId?: string) => {
      try {
        const detail = await api.getBase(baseId);
        setActiveBase(detail);
        const nextTable =
          detail.tables.find((t) => t.id === preferredTableId) ?? detail.tables[0] ?? null;
        setActiveTableId(nextTable?.id ?? null);
        const nextView =
          nextTable?.views.find((v) => v.id === preferredViewId) ?? nextTable?.views[0] ?? null;
        setActiveViewId(nextView?.id ?? null);
      } catch (err) {
        showError(err);
      }
    },
    [],
  );

  const loadBases = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listBases();
      setAuthNeeded(false);

      // 首次访问若尚无空间，像飞书多维表格一样自动静默生成首个纯净空白空间
      if (list.length === 0 && !autoBootstrappedRef.current) {
        autoBootstrappedRef.current = true;
        const created = await api.createBase({ name: '我的多维表格' });
        const refreshedList = await api.listBases();
        setBases(refreshedList);
        setActiveBase(created);
        setActiveTableId(created.tables[0]?.id ?? null);
        setActiveViewId(created.tables[0]?.views[0]?.id ?? null);
        return;
      }

      setBases(list);
      if (list.length > 0) {
        await loadBaseDetail(list[0]!.id);
      } else {
        setActiveBase(null);
        setActiveTableId(null);
        setActiveViewId(null);
      }
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [loadBaseDetail]);

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  // 预加载当前表全部关联字段对应目标表的主键名称
  useEffect(() => {
    if (!activeBase || !activeTable) {
      setLinkedRecordMap({});
      return;
    }
    const targetTableIds = Array.from(
      new Set(
        activeTable.fields
          .filter((f) => f.type === 'link' && f.options.targetTableId)
          .map((f) => f.options.targetTableId!),
      ),
    );
    if (targetTableIds.length === 0) {
      setLinkedRecordMap({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      targetTableIds.map(async (tid) => {
        const tbl = activeBase.tables.find((t) => t.id === tid);
        if (!tbl) return [];
        const res = await api.queryRecords(activeBase.id, tid, { limit: 200 });
        return res.records.map((r) => [
          r.id,
          String(r.fields[tbl.primaryFieldId] ?? r.id),
        ] as const);
      }),
    )
      .then((groups) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const pairs of groups) {
          for (const [id, label] of pairs) {
            map[id] = label;
          }
        }
        setLinkedRecordMap(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeBase, activeTable]);

  const refreshRecords = useCallback(async () => {
    if (!activeBase || !activeTable) {
      setRecords([]);
      setTotalCount(0);
      return;
    }
    try {
      const res = await api.queryRecords(activeBase.id, activeTable.id, {
        search: search || undefined,
        filter: filter.conditions.length > 0 ? filter : undefined,
        sorts: sorts.length > 0 ? sorts : undefined,
        limit: 200,
      });
      setRecords(res.records);
      setTotalCount(res.total);
      setDrawerRecord((prev) => {
        if (!prev) return null;
        return res.records.find((r) => r.id === prev.id) ?? prev;
      });
    } catch (err) {
      showError(err);
    }
  }, [activeBase, activeTable, search, filter, sorts]);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  const { status: wsStatus, onlineCount, lastActivity } = useBaseRealtime({
    baseId: activeBase?.id ?? null,
    onRecordsChanged: (changedTableId) => {
      if (changedTableId === activeTable?.id) {
        void refreshRecords();
      }
    },
    onSchemaChanged: () => {
      if (activeBase) {
        void loadBaseDetail(activeBase.id, activeTable?.id, activeView?.id);
      }
    },
  });

  const handleCreateBlankBase = async (name: string) => {
    try {
      const created = await api.createBase({ name });
      const list = await api.listBases();
      setBases(list);
      setActiveBase(created);
      setActiveTableId(created.tables[0]?.id ?? null);
      setActiveViewId(created.tables[0]?.views[0]?.id ?? null);
    } catch (err) {
      showError(err);
    }
  };

  const handlePatchRecord = async (recordId: string, fields: Record<string, unknown>) => {
    if (!activeBase || !activeTable) return;
    try {
      await api.updateRecord(activeBase.id, activeTable.id, recordId, fields);
      await refreshRecords();
    } catch (err) {
      showError(err);
    }
  };

  const handleAddRecord = async (
    defaults: Record<string, unknown> = {},
    openDrawer = true,
  ) => {
    if (!activeBase || !activeTable) return;
    try {
      const res = await api.createRecord(activeBase.id, activeTable.id, defaults);
      await refreshRecords();
      if (openDrawer && res.records[0]) {
        setDrawerRecord(res.records[0]);
      }
    } catch (err) {
      showError(err);
    }
  };

  const handleDeleteRecords = async (recordIds: string[]) => {
    if (!activeBase || !activeTable) return;
    try {
      await api.deleteRecords(activeBase.id, activeTable.id, recordIds);
      await refreshRecords();
    } catch (err) {
      showError(err);
    }
  };

  const handleSaveField = async (input: { name: string; type: FieldType; options: FieldOptions }) => {
    if (!activeBase || !activeTable) return;
    if (editingField) {
      await api.updateField(activeBase.id, activeTable.id, editingField.id, {
        name: input.name,
        options: input.options,
      });
    } else {
      await api.createField(activeBase.id, activeTable.id, input);
    }
    await loadBaseDetail(activeBase.id, activeTable.id, activeView?.id);
    await refreshRecords();
  };

  const handleUpdateViewConfig = async (viewId: string, config: ViewConfig) => {
    if (!activeBase || !activeTable) return;
    try {
      await api.updateView(activeBase.id, activeTable.id, viewId, { config });
      await loadBaseDetail(activeBase.id, activeTable.id, viewId);
    } catch (err) {
      showError(err);
    }
  };

  if (authNeeded) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            localStorage.setItem('flaretable_admin_passcode', passcodeInput);
            void loadBases();
          }}
          className="bg-white rounded-[24px] ios-popover p-7 w-full max-w-sm space-y-4 text-center"
        >
          <div className="flex justify-center">
            <IOSSquircleIcon tone="blue" size="lg">
              <Lock className="w-5 h-5" />
            </IOSSquircleIcon>
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-[#1D1D1F]">FlareTable 身份验证</h2>
            <p className="text-[12px] text-[#86868B] mt-1">当前工作台已启用管理口令保护</p>
          </div>
          <input
            type="password"
            required
            autoFocus
            value={passcodeInput}
            onChange={(e) => setPasscodeInput(e.target.value)}
            placeholder="输入 ADMIN_PASSCODE..."
            className="w-full px-3.5 py-2.5 text-[14px] bg-[#F2F2F7] rounded-[12px] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-[13px] font-semibold ios-press"
          >
            解锁工作台
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#F2F2F7] p-3 gap-3 text-[#1D1D1F]">
      {sidebarOpen && (
        <Sidebar
          bases={bases}
          activeBaseId={activeBase?.id ?? null}
          tables={activeBase?.tables ?? []}
          activeTableId={activeTable?.id ?? null}
          onSelectBase={(id) => {
            setFilter({ conjunction: 'and', conditions: [] });
            setSorts([]);
            setSearch('');
            void loadBaseDetail(id);
          }}
          onSelectTable={(tid) => {
            setActiveTableId(tid);
            const tbl = activeBase?.tables.find((t) => t.id === tid);
            setActiveViewId(tbl?.views[0]?.id ?? null);
            setFilter({ conjunction: 'and', conditions: [] });
            setSorts([]);
            setSearch('');
          }}
          onCreateBase={async (input) => {
            await handleCreateBlankBase(input.name);
          }}
          onRenameBase={async (baseId, name) => {
            await api.updateBase(baseId, { name });
            const list = await api.listBases();
            setBases(list);
            if (activeBase?.id === baseId) {
              await loadBaseDetail(baseId, activeTable?.id, activeView?.id);
            }
          }}
          onDeleteBase={async (id) => {
            await api.deleteBase(id);
            await loadBases();
          }}
          onCreateTable={async (name) => {
            if (!activeBase) return;
            const tbl = await api.createTable(activeBase.id, {
              name,
              primaryFieldName: '文本',
              includeStarterFields: true,
            });
            await loadBaseDetail(activeBase.id, tbl.id);
          }}
          onRenameTable={async (tableId, name) => {
            if (!activeBase) return;
            await api.updateTable(activeBase.id, tableId, { name });
            await loadBaseDetail(activeBase.id, activeTable?.id, activeView?.id);
          }}
          onDeleteTable={async (tableId) => {
            if (!activeBase) return;
            await api.deleteTable(activeBase.id, tableId);
            const nextTid = activeTable?.id === tableId ? undefined : activeTable?.id;
            await loadBaseDetail(activeBase.id, nextTid);
          }}
          onOpenAutomation={() => setShowAutomation(true)}
        />
      )}

      {/* 右侧浮动圆角白卡主画布 */}
      <main className="flex-1 flex flex-col min-w-0 rounded-[22px] bg-white ios-floating-panel overflow-hidden">
        {errorToast && (
          <div className="bg-[#FF3B30] text-white px-4 py-2 text-[12px] font-medium flex items-center justify-between shrink-0">
            <span>{errorToast}</span>
            <button type="button" onClick={() => setErrorToast('')} className="underline">
              关闭
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-[#86868B]">
            正在加载工作区...
          </div>
        ) : !activeBase || !activeTable ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-[#F9F9FB]">
            <div className="max-w-sm w-full bg-white rounded-[24px] ios-floating-panel p-8 text-center space-y-4">
              <div className="flex justify-center">
                <IOSSquircleIcon tone="blue" size="lg">
                  <Table2 className="w-5 h-5" />
                </IOSSquircleIcon>
              </div>
              <div className="space-y-1">
                <h2 className="text-[17px] font-bold text-[#1D1D1F]">暂无多维表格空间</h2>
                <p className="text-[12px] text-[#86868B]">
                  创建一个空白多维表格空间，自由定义数据表、字段与视图
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateBlankBase('我的多维表格')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(0,122,255,0.28)] ios-press"
              >
                <Plus className="w-4 h-4" />
                <span>新建空白多维表格</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <ViewHeader
              table={activeTable}
              activeView={activeView}
              totalCount={totalCount}
              search={search}
              filter={filter}
              sorts={sorts}
              showFieldIds={showFieldIds}
              sidebarOpen={sidebarOpen}
              wsStatus={wsStatus}
              onlineCount={onlineCount}
              lastActivity={lastActivity}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onSelectView={(vid) => setActiveViewId(vid)}
              onCreateView={async (vt: ViewType) => {
                const nameMap: Record<ViewType, string> = {
                  grid: '表格视图',
                  kanban: '看板视图',
                  gallery: '画廊视图',
                  form: '收集表单',
                };
                const created = await api.createView(activeBase.id, activeTable.id, {
                  name: `${nameMap[vt]} ${activeTable.views.length + 1}`,
                  type: vt,
                });
                await loadBaseDetail(activeBase.id, activeTable.id, created.id);
              }}
              onRenameView={async (viewId, name) => {
                await api.updateView(activeBase.id, activeTable.id, viewId, { name });
                await loadBaseDetail(activeBase.id, activeTable.id, viewId);
              }}
              onDeleteView={async (viewId) => {
                await api.deleteView(activeBase.id, activeTable.id, viewId);
                await loadBaseDetail(activeBase.id, activeTable.id);
              }}
              onSearchChange={setSearch}
              onFilterChange={setFilter}
              onSortsChange={setSorts}
              onToggleFieldIds={() => setShowFieldIds((v) => !v)}
              onAddRecord={() => handleAddRecord({}, true)}
              onAddField={() => {
                setEditingField(null);
                setShowFieldModal(true);
              }}
            />

            {(!activeView || activeView.type === 'grid') && (
              <GridView
                table={activeTable}
                records={records}
                showFieldIds={showFieldIds}
                linkedRecordMap={linkedRecordMap}
                onPatchRecord={handlePatchRecord}
                onAddInlineRecord={() => handleAddRecord({}, false)}
                onDeleteRecords={handleDeleteRecords}
                onOpenRecord={(rec) => setDrawerRecord(rec)}
                onEditField={(field) => {
                  setEditingField(field);
                  setShowFieldModal(true);
                }}
                onDeleteField={async (fieldId) => {
                  await api.deleteField(activeBase.id, activeTable.id, fieldId);
                  await loadBaseDetail(activeBase.id, activeTable.id, activeView?.id);
                  await refreshRecords();
                }}
                onAddField={() => {
                  setEditingField(null);
                  setShowFieldModal(true);
                }}
              />
            )}

            {activeView?.type === 'kanban' && (
              <KanbanView
                table={activeTable}
                view={activeView}
                records={records}
                linkedRecordMap={linkedRecordMap}
                onPatchRecord={handlePatchRecord}
                onOpenRecord={(rec) => setDrawerRecord(rec)}
                onCreateRecordWithDefaults={(defaults) => handleAddRecord(defaults, false)}
                onUpdateViewGroupField={(fieldId) =>
                  handleUpdateViewConfig(activeView.id, {
                    ...activeView.config,
                    groupByFieldId: fieldId,
                  })
                }
              />
            )}

            {activeView?.type === 'gallery' && (
              <GalleryView
                table={activeTable}
                records={records}
                linkedRecordMap={linkedRecordMap}
                onOpenRecord={(rec) => setDrawerRecord(rec)}
              />
            )}

            {activeView?.type === 'form' && (
              <FormView
                table={activeTable}
                view={activeView}
                onUpdateViewConfig={(cfg) => handleUpdateViewConfig(activeView.id, cfg)}
                onSubmitInternal={async (fields) => {
                  await api.createRecord(activeBase.id, activeTable.id, fields);
                  await refreshRecords();
                }}
              />
            )}
          </>
        )}
      </main>

      {showFieldModal && activeTable && activeBase && (
        <FieldModal
          tables={activeBase.tables}
          currentTable={activeTable}
          editingField={editingField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
          onSubmit={handleSaveField}
        />
      )}

      {drawerRecord && activeBase && activeTable && (
        <RecordDrawer
          baseId={activeBase.id}
          table={activeTable}
          allTables={activeBase.tables}
          record={drawerRecord}
          onClose={() => setDrawerRecord(null)}
          onPatchRecord={handlePatchRecord}
          onDeleteRecord={async (recId) => handleDeleteRecords([recId])}
        />
      )}

      {showAutomation && (
        <AutomationDrawer
          activeBaseId={activeBase?.id ?? null}
          activeTable={activeTable}
          onClose={() => setShowAutomation(false)}
        />
      )}
    </div>
  );
}
