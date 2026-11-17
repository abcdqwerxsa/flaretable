import { useEffect, useRef, useState } from 'react';
import {
  COMPUTED_FIELD_TYPES,
  FILTER_OPERATOR_LABELS,
  FILTER_OPERATORS,
  VIEW_TYPE_LABELS,
  type FieldMeta,
  type FilterCondition,
  type FilterGroup,
  type SortSpec,
  type TableWithSchema,
  type ViewMeta,
  type ViewType,
} from '@flaretable/shared';
import {
  ArrowUpDown,
  Code2,
  FileText,
  Filter,
  Kanban,
  LayoutGrid,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Table,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { WsConnectionStatus } from '../lib/realtime.js';

interface ViewHeaderProps {
  table: TableWithSchema;
  activeView: ViewMeta | null;
  totalCount: number;
  search: string;
  filter: FilterGroup;
  sorts: SortSpec[];
  showFieldIds: boolean;
  sidebarOpen: boolean;
  wsStatus: WsConnectionStatus;
  onlineCount: number;
  lastActivity: string;
  onToggleSidebar: () => void;
  onSelectView: (viewId: string) => void;
  onCreateView: (type: ViewType) => Promise<void>;
  onRenameView: (viewId: string, name: string) => Promise<void>;
  onDeleteView: (viewId: string) => Promise<void>;
  onSearchChange: (val: string) => void;
  onFilterChange: (next: FilterGroup) => void;
  onSortsChange: (next: SortSpec[]) => void;
  onToggleFieldIds: () => void;
  onAddRecord: () => Promise<void>;
  onAddField: () => void;
}

function ViewIcon({ type }: { type: ViewType }) {
  switch (type) {
    case 'grid':
      return <Table className="w-3.5 h-3.5" strokeWidth={1.9} />;
    case 'kanban':
      return <Kanban className="w-3.5 h-3.5" strokeWidth={1.9} />;
    case 'gallery':
      return <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.9} />;
    case 'form':
      return <FileText className="w-3.5 h-3.5" strokeWidth={1.9} />;
  }
}

export function ViewHeader({
  table,
  activeView,
  totalCount,
  search,
  filter,
  sorts,
  showFieldIds,
  sidebarOpen,
  wsStatus,
  onlineCount,
  lastActivity,
  onToggleSidebar,
  onSelectView,
  onCreateView,
  onRenameView,
  onDeleteView,
  onSearchChange,
  onFilterChange,
  onSortsChange,
  onToggleFieldIds,
  onAddRecord,
  onAddField,
}: ViewHeaderProps) {
  const [showFilterPop, setShowFilterPop] = useState(false);
  const [showSortPop, setShowSortPop] = useState(false);
  const [showAddViewMenu, setShowAddViewMenu] = useState(false);
  const [copiedTblId, setCopiedTblId] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setShowAddViewMenu(false);
        setShowFilterPop(false);
        setShowSortPop(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filterableFields = table.fields.filter((f: FieldMeta) => !COMPUTED_FIELD_TYPES.has(f.type));

  const addFilterCondition = () => {
    const firstField = filterableFields[0];
    if (!firstField) return;
    const cond: FilterCondition = {
      field: firstField.id,
      operator: 'contains',
      value: '',
    };
    onFilterChange({
      conjunction: filter.conjunction,
      conditions: [...filter.conditions, cond],
    });
  };

  const addSortSpec = () => {
    const firstField = filterableFields[0];
    if (!firstField) return;
    onSortsChange([...sorts, { field: firstField.id, direction: 'asc' }]);
  };

  return (
    <header
      ref={headerRef}
      className="relative z-40 bg-white/90 backdrop-blur-xl border-b border-black/[0.06] shrink-0"
    >
      {/* 第一层：iPadOS 宽松导航栏 */}
      <div className="h-[54px] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 transition-colors shrink-0 ios-press"
          >
            <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.85} />
          </button>

          <h1
            onClick={() => {
              void navigator.clipboard.writeText(table.id);
              setCopiedTblId(true);
              setTimeout(() => setCopiedTblId(false), 1500);
            }}
            title={`点击复制数据表 ID: ${table.id}`}
            className="text-[16px] font-semibold tracking-tight text-[#1D1D1F] truncate cursor-pointer hover:text-[#007AFF] transition-colors"
          >
            {table.name}
          </h1>

          <span className="text-[11px] font-medium text-[#86868B] bg-[#767680]/[0.09] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {copiedTblId ? '已复制表 ID' : `${totalCount} 条`}
          </span>

          {lastActivity && (
            <span className="hidden xl:inline-flex items-center text-[11px] font-medium text-[#1E823C] bg-[#34C759]/12 px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
              {lastActivity}
            </span>
          )}
        </div>

        {/* 右侧胶囊操作区（全部强制单行不折行） */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            title={
              wsStatus === 'connected'
                ? 'Durable Object 实时协同已连接'
                : '实时协同重连中'
            }
            className="flex items-center gap-1.5 text-[12px] text-[#1D1D1F] bg-[#767680]/[0.08] rounded-full px-2.5 py-1.5 whitespace-nowrap shrink-0"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-[#34C759]'
                  : wsStatus === 'connecting'
                    ? 'bg-[#FF9500] animate-pulse'
                    : 'bg-[#8E8E93]'
              }`}
            />
            <Users className="w-3.5 h-3.5 text-[#86868B]" strokeWidth={1.85} />
            <span className="font-mono text-[11px] font-medium">{onlineCount}</span>
          </div>

          <button
            type="button"
            onClick={onToggleFieldIds}
            title="切换显示底层字段 ID (fld_xxx)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ios-press ${
              showFieldIds
                ? 'bg-[#5856D6]/14 text-[#4543B5]'
                : 'bg-[#767680]/[0.08] text-[#1D1D1F] hover:bg-[#767680]/[0.14]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" strokeWidth={1.9} />
            <span className="hidden sm:inline">字段 ID</span>
          </button>

          <button
            type="button"
            onClick={onAddField}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/16 transition-colors whitespace-nowrap shrink-0 ios-press"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span>新增列</span>
          </button>

          <button
            type="button"
            onClick={() => void onAddRecord()}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-[0_2px_8px_rgba(0,122,255,0.28)] transition-all whitespace-nowrap shrink-0 ios-press"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
            <span>新增记录</span>
          </button>
        </div>
      </div>

      {/* 第二层：iPadOS 分段胶囊视图切换 + Spotlight 搜索与筛选 */}
      <div className="px-4 pb-2.5 pt-0.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segmented Control 胶囊轨道（支持重命名与删除多余视图） */}
          <div className="inline-flex items-center bg-[#767680]/[0.09] p-[3px] rounded-full gap-0.5">
            {table.views.map((view) => {
              const active = activeView?.id === view.id;
              return (
                <div
                  key={view.id}
                  onClick={() => onSelectView(view.id)}
                  onDoubleClick={() => {
                    const nextName = window.prompt('输入新的视图名称', view.name);
                    if (nextName && nextName.trim() && nextName.trim() !== view.name) {
                      void onRenameView(view.id, nextName.trim());
                    }
                  }}
                  title="点击切换，双击可重命名视图"
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] transition-all whitespace-nowrap cursor-pointer ios-press ${
                    active
                      ? 'bg-white text-[#1D1D1F] font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.1)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F] font-medium'
                  }`}
                >
                  <ViewIcon type={view.type} />
                  <span>{view.name}</span>
                  {active && (
                    <span className="inline-flex items-center gap-0.5 ml-0.5 pl-1 border-l border-black/10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextName = window.prompt('输入新的视图名称', view.name);
                          if (nextName && nextName.trim() && nextName.trim() !== view.name) {
                            void onRenameView(view.id, nextName.trim());
                          }
                        }}
                        title="重命名当前视图"
                        className="p-0.5 rounded-full text-[#86868B] hover:text-[#007AFF]"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                      {table.views.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`确认删除视图「${view.name}」吗？`)) {
                              void onDeleteView(view.id);
                            }
                          }}
                          title="删除当前视图"
                          className="p-0.5 rounded-full text-[#86868B] hover:text-[#FF3B30]"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAddViewMenu((v) => !v);
                setShowFilterPop(false);
                setShowSortPop(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium text-[#007AFF] hover:bg-[#007AFF]/10 whitespace-nowrap transition-colors ios-press"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
              <span>新视图</span>
            </button>
            {showAddViewMenu && (
              <div className="absolute left-0 top-9 z-50 w-40 bg-white/95 backdrop-blur-2xl rounded-[14px] ios-popover p-1.5 space-y-0.5">
                {(['grid', 'kanban', 'gallery', 'form'] as ViewType[]).map((vt) => (
                  <button
                    key={vt}
                    type="button"
                    onClick={() => {
                      setShowAddViewMenu(false);
                      void onCreateView(vt);
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-[12px] font-medium text-[#1D1D1F] hover:bg-[#007AFF]/10 hover:text-[#007AFF] rounded-[9px] flex items-center gap-2 transition-colors"
                  >
                    <ViewIcon type={vt} />
                    <span>{VIEW_TYPE_LABELS[vt]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧 Spotlight 搜索 + 筛选 + 排序 */}
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#86868B] absolute left-3 top-[7px]" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索记录..."
              className="pl-8 pr-7 py-1 text-[12px] bg-[#767680]/[0.09] focus:bg-white border border-transparent focus:border-[#007AFF]/40 rounded-full w-44 transition-all focus:outline-none focus:w-56 text-[#1D1D1F] placeholder:text-[#86868B]"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-[5px] text-[#86868B] hover:text-[#1D1D1F]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 筛选弹出层 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFilterPop((v) => !v);
                setShowSortPop(false);
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ios-press ${
                filter.conditions.length > 0
                  ? 'bg-[#007AFF]/12 text-[#007AFF] font-semibold'
                  : 'bg-[#767680]/[0.09] text-[#1D1D1F] hover:bg-[#767680]/[0.14]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" strokeWidth={1.9} />
              <span>筛选{filter.conditions.length > 0 ? ` (${filter.conditions.length})` : ''}</span>
            </button>

            {showFilterPop && (
              <div className="absolute right-0 top-9 z-50 w-[440px] max-w-[92vw] bg-white/95 backdrop-blur-2xl rounded-[18px] ios-popover p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-semibold text-[#1D1D1F]">条件逻辑</span>
                    <select
                      value={filter.conjunction}
                      onChange={(e) =>
                        onFilterChange({
                          ...filter,
                          conjunction: e.target.value as 'and' | 'or',
                        })
                      }
                      className="rounded-full px-2.5 py-0.5 text-[12px] bg-[#767680]/[0.1] font-medium focus:outline-none"
                    >
                      <option value="and">同时满足 (AND)</option>
                      <option value="or">满足任一 (OR)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilterPop(false)}
                    className="w-6 h-6 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {filter.conditions.length === 0 ? (
                  <p className="text-[12px] text-[#86868B] py-2">尚未添加任何筛选条件</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {filter.conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select
                          value={cond.field}
                          onChange={(e) => {
                            const next = [...filter.conditions];
                            next[idx] = { ...cond, field: e.target.value };
                            onFilterChange({ ...filter, conditions: next });
                          }}
                          className="w-32 text-[12px] border border-black/10 rounded-[10px] px-2 py-1.5 bg-[#F2F2F7]"
                        >
                          {filterableFields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={cond.operator}
                          onChange={(e) => {
                            const next = [...filter.conditions];
                            next[idx] = { ...cond, operator: e.target.value as FilterCondition['operator'] };
                            onFilterChange({ ...filter, conditions: next });
                          }}
                          className="w-28 text-[12px] border border-black/10 rounded-[10px] px-2 py-1.5 bg-[#F2F2F7]"
                        >
                          {FILTER_OPERATORS.map((op) => (
                            <option key={op} value={op}>
                              {FILTER_OPERATOR_LABELS[op]}
                            </option>
                          ))}
                        </select>

                        {cond.operator !== 'is_empty' && cond.operator !== 'is_not_empty' && (
                          <input
                            type="text"
                            value={cond.value === undefined || cond.value === null ? '' : String(cond.value)}
                            onChange={(e) => {
                              const next = [...filter.conditions];
                              next[idx] = { ...cond, value: e.target.value };
                              onFilterChange({ ...filter, conditions: next });
                            }}
                            placeholder="值..."
                            className="flex-1 text-[12px] border border-black/10 rounded-[10px] px-2.5 py-1.5 focus:outline-none focus:border-[#007AFF]"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const next = filter.conditions.filter((_, i) => i !== idx);
                            onFilterChange({ ...filter, conditions: next });
                          }}
                          className="text-[#86868B] hover:text-[#FF3B30] p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={addFilterCondition}
                    className="text-[12px] text-[#007AFF] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加条件</span>
                  </button>
                  {filter.conditions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onFilterChange({ conjunction: 'and', conditions: [] })}
                      className="text-[12px] text-[#86868B] hover:text-[#1D1D1F]"
                    >
                      清空全部
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 排序弹出层 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSortPop((v) => !v);
                setShowFilterPop(false);
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ios-press ${
                sorts.length > 0
                  ? 'bg-[#007AFF]/12 text-[#007AFF] font-semibold'
                  : 'bg-[#767680]/[0.09] text-[#1D1D1F] hover:bg-[#767680]/[0.14]'
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={1.9} />
              <span>排序{sorts.length > 0 ? ` (${sorts.length})` : ''}</span>
            </button>

            {showSortPop && (
              <div className="absolute right-0 top-9 z-50 w-80 bg-white/95 backdrop-blur-2xl rounded-[18px] ios-popover p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#1D1D1F]">排序规则</span>
                  <button
                    type="button"
                    onClick={() => setShowSortPop(false)}
                    className="w-6 h-6 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {sorts.length === 0 ? (
                  <p className="text-[12px] text-[#86868B] py-2">默认按表格行序号展示</p>
                ) : (
                  <div className="space-y-2">
                    {sorts.map((sort, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select
                          value={sort.field}
                          onChange={(e) => {
                            const next = [...sorts];
                            next[idx] = { ...sort, field: e.target.value };
                            onSortsChange(next);
                          }}
                          className="flex-1 text-[12px] border border-black/10 rounded-[10px] px-2 py-1.5 bg-[#F2F2F7]"
                        >
                          {filterableFields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={sort.direction}
                          onChange={(e) => {
                            const next = [...sorts];
                            next[idx] = { ...sort, direction: e.target.value as 'asc' | 'desc' };
                            onSortsChange(next);
                          }}
                          className="w-24 text-[12px] border border-black/10 rounded-[10px] px-2 py-1.5 bg-[#F2F2F7]"
                        >
                          <option value="asc">升序</option>
                          <option value="desc">降序</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onSortsChange(sorts.filter((_, i) => i !== idx))}
                          className="text-[#86868B] hover:text-[#FF3B30] p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={addSortSpec}
                    className="text-[12px] text-[#007AFF] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加排序字段</span>
                  </button>
                  {sorts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onSortsChange([])}
                      className="text-[12px] text-[#86868B] hover:text-[#1D1D1F]"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
