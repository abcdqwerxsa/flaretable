import { useState } from 'react';
import type { BaseSummary, TableWithSchema } from '@flaretable/shared';
import {
  BookOpen,
  Bot,
  Check,
  ChevronsUpDown,
  FileJson2,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Table2,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { IOSSheetGrabber, IOSSquircleIcon } from './AppleUI.js';

interface SidebarProps {
  bases: BaseSummary[];
  activeBaseId: string | null;
  tables: TableWithSchema[];
  activeTableId: string | null;
  onSelectBase: (baseId: string) => void;
  onSelectTable: (tableId: string) => void;
  onCreateBase: (input: { name: string }) => Promise<void>;
  onRenameBase: (baseId: string, name: string) => Promise<void>;
  onDeleteBase: (baseId: string) => Promise<void>;
  onCreateTable: (name: string) => Promise<void>;
  onRenameTable: (tableId: string, name: string) => Promise<void>;
  onDeleteTable: (tableId: string) => Promise<void>;
  onOpenAutomation: () => void;
}

export function Sidebar({
  bases,
  activeBaseId,
  tables,
  activeTableId,
  onSelectBase,
  onSelectTable,
  onCreateBase,
  onRenameBase,
  onDeleteBase,
  onCreateTable,
  onRenameTable,
  onDeleteTable,
  onOpenAutomation,
}: SidebarProps) {
  const [showBaseMenu, setShowBaseMenu] = useState(false);
  const [showNewBaseModal, setShowNewBaseModal] = useState(false);
  const [newBaseName, setNewBaseName] = useState('');
  const [creatingBase, setCreatingBase] = useState(false);

  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);
  const [renamingTableName, setRenamingTableName] = useState('');

  const activeBase = bases.find((b) => b.id === activeBaseId) ?? null;

  const handleCreateBaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBaseName.trim()) return;
    setCreatingBase(true);
    try {
      await onCreateBase({ name: newBaseName.trim() });
      setNewBaseName('');
      setShowNewBaseModal(false);
    } finally {
      setCreatingBase(false);
    }
  };

  const handleCreateTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    await onCreateTable(newTableName.trim());
    setNewTableName('');
    setAddingTable(false);
  };

  const commitRenameTable = async (tableId: string) => {
    const trimmed = renamingTableName.trim();
    setRenamingTableId(null);
    if (!trimmed) return;
    const orig = tables.find((t) => t.id === tableId)?.name;
    if (orig !== trimmed) {
      await onRenameTable(tableId, trimmed);
    }
  };

  return (
    <aside className="w-[260px] shrink-0 rounded-[22px] bg-white/82 backdrop-blur-2xl ios-floating-panel flex flex-col overflow-hidden select-none">
      {/* iPadOS 侧边栏顶栏 */}
      <div className="h-[54px] px-4 flex items-center justify-between border-b border-black/[0.06]">
        <div className="flex items-center gap-2.5">
          <IOSSquircleIcon tone="blue" size="sm">
            <Layers className="w-3.5 h-3.5" strokeWidth={2} />
          </IOSSquircleIcon>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[15px] tracking-tight text-[#1D1D1F]">
              FlareTable
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF]">
              Edge
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNewBaseModal(true)}
          title="新建空白多维表格"
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 transition-colors ios-press"
        >
          <FolderPlus className="w-4 h-4" strokeWidth={1.9} />
        </button>
      </div>

      {/* 空间切换弹出器 */}
      <div className="p-3 border-b border-black/[0.06] relative">
        <div className="text-[11px] font-semibold text-[#86868B] px-1.5 mb-1.5">
          工作空间
        </div>

        <button
          type="button"
          onClick={() => setShowBaseMenu((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[12px] bg-[#767680]/[0.08] hover:bg-[#767680]/[0.12] transition-colors text-left ios-press"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#1D1D1F] truncate">
              {activeBase ? activeBase.name : '暂无空间'}
            </div>
            {activeBase && (
              <div className="text-[11px] text-[#86868B] font-mono truncate">
                {activeBase.tableCount} 张表 · {activeBase.id.slice(0, 12)}
              </div>
            )}
          </div>
          <ChevronsUpDown className="w-4 h-4 text-[#86868B] shrink-0" />
        </button>

        {showBaseMenu && (
          <div
            onMouseLeave={() => setShowBaseMenu(false)}
            className="absolute left-3 right-3 top-[74px] z-40 rounded-[16px] bg-white/95 backdrop-blur-2xl ios-popover p-1.5 space-y-0.5"
          >
            {bases.map((b) => {
              const selected = b.id === activeBaseId;
              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer transition-colors ${
                    selected ? 'bg-[#007AFF]/10 text-[#007AFF] font-medium' : 'hover:bg-black/[0.04] text-[#1D1D1F]'
                  }`}
                  onClick={() => {
                    onSelectBase(b.id);
                    setShowBaseMenu(false);
                  }}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate">{b.name}</div>
                    <div className="text-[10px] text-[#86868B] font-mono">{b.tableCount} 张表</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selected && <Check className="w-3.5 h-3.5 text-[#007AFF]" strokeWidth={2.5} />}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextName = window.prompt('输入新的工作空间名称', b.name);
                        if (nextName && nextName.trim() && nextName.trim() !== b.name) {
                          setShowBaseMenu(false);
                          void onRenameBase(b.id, nextName.trim());
                        }
                      }}
                      title="重命名空间"
                      className="p-1 rounded-full text-[#86868B] hover:text-[#007AFF] hover:bg-[#007AFF]/10"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`确定删除空间「${b.name}」吗？此操作不可撤销。`)) {
                          setShowBaseMenu(false);
                          void onDeleteBase(b.id);
                        }
                      }}
                      title="删除空间"
                      className="p-1 rounded-full text-[#86868B] hover:text-[#FF3B30] hover:bg-[#FF3B30]/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="pt-1 mt-1 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setShowBaseMenu(false);
                  setShowNewBaseModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium text-[#007AFF] hover:bg-[#007AFF]/8"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建空白多维表格...</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 数据表目录（支持新建 / 重命名 / 删除） */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between px-1.5 mb-2">
          <span className="text-[11px] font-semibold text-[#86868B]">
            数据表 ({tables.length})
          </span>
          {activeBaseId && (
            <button
              type="button"
              onClick={() => setAddingTable(true)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 transition-colors ios-press"
              title="新建空白数据表"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>

        <div className="space-y-1">
          {tables.map((t) => {
            const active = t.id === activeTableId;
            const isRenaming = renamingTableId === t.id;

            if (isRenaming) {
              return (
                <div key={t.id} className="px-2 py-1.5 rounded-[12px] bg-[#F2F2F7]">
                  <input
                    type="text"
                    autoFocus
                    value={renamingTableName}
                    onChange={(e) => setRenamingTableName(e.target.value)}
                    onBlur={() => void commitRenameTable(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRenameTable(t.id);
                      if (e.key === 'Escape') setRenamingTableId(null);
                    }}
                    className="w-full bg-white text-[12px] px-2 py-1 rounded-[8px] border border-[#007AFF] focus:outline-none"
                  />
                </div>
              );
            }

            return (
              <div
                key={t.id}
                onClick={() => onSelectTable(t.id)}
                className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] text-[13px] cursor-pointer transition-all ios-press ${
                  active
                    ? 'bg-[#007AFF]/12 text-[#007AFF] font-semibold'
                    : 'text-[#1D1D1F] hover:bg-black/[0.04]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Table2
                    className={`w-4 h-4 shrink-0 ${active ? 'text-[#007AFF]' : 'text-[#86868B]'}`}
                    strokeWidth={1.85}
                  />
                  <span className="truncate">{t.name}</span>
                </span>

                <div className="flex items-center gap-0.5 shrink-0">
                  <span
                    className={`text-[11px] font-mono px-1.5 py-0.5 rounded-full group-hover:hidden ${
                      active ? 'bg-[#007AFF]/15 text-[#007AFF]' : 'text-[#86868B]'
                    }`}
                  >
                    {t.fields.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingTableId(t.id);
                      setRenamingTableName(t.name);
                    }}
                    title="重命名数据表"
                    className="hidden group-hover:inline-flex p-1 rounded-full text-[#86868B] hover:text-[#007AFF] hover:bg-white/80"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  {tables.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`确定删除数据表「${t.name}」吗？表中全部记录将被清空。`)) {
                          void onDeleteTable(t.id);
                        }
                      }}
                      title="删除数据表"
                      className="hidden group-hover:inline-flex p-1 rounded-full text-[#86868B] hover:text-[#FF3B30] hover:bg-white/80"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {addingTable && (
          <form
            onSubmit={handleCreateTableSubmit}
            className="mt-2.5 p-2.5 rounded-[14px] bg-[#F2F2F7] space-y-2"
          >
            <input
              type="text"
              autoFocus
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder={`数据表 ${tables.length + 1}`}
              className="w-full bg-white text-[#1D1D1F] text-[12px] px-2.5 py-1.5 rounded-[9px] border border-black/10 focus:outline-none focus:border-[#007AFF]"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setAddingTable(false)}
                className="px-2.5 py-1 text-[11px] text-[#86868B] hover:text-[#1D1D1F]"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-[11px] bg-[#007AFF] text-white rounded-full font-medium ios-press"
              >
                创建
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 底部自动化与开放平台卡片区 */}
      <div className="p-3 border-t border-black/[0.06] space-y-2 bg-black/[0.015]">
        <button
          type="button"
          onClick={onOpenAutomation}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-[14px] bg-white hover:bg-white/90 text-[#1D1D1F] text-[13px] font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.06)] transition-all ios-press"
        >
          <span className="flex items-center gap-2.5">
            <IOSSquircleIcon tone="green" size="sm">
              <Webhook className="w-3.5 h-3.5" strokeWidth={2} />
            </IOSSquircleIcon>
            <span>自动化与 MCP</span>
          </span>
          <Bot className="w-4 h-4 text-[#007AFF]" strokeWidth={1.85} />
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-[11px] font-medium text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04] transition-colors"
          >
            <BookOpen className="w-3 h-3" />
            <span>API 文档</span>
          </a>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-[11px] font-medium text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04] transition-colors"
          >
            <FileJson2 className="w-3 h-3" />
            <span>OpenAPI</span>
          </a>
        </div>
      </div>

      {/* 极简新建空白多维表格 Sheet 弹窗 */}
      {showNewBaseModal && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#F2F2F7] text-[#1D1D1F] rounded-[24px] ios-popover w-full max-w-sm overflow-hidden">
            <IOSSheetGrabber />
            <div className="px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-[15px]">新建空白多维表格</h3>
              <button
                type="button"
                onClick={() => setShowNewBaseModal(false)}
                className="w-7 h-7 rounded-full bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center text-[#86868B]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateBaseSubmit} className="px-5 pb-5 space-y-4">
              <div className="bg-white rounded-[16px] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <label className="block text-[11px] font-semibold text-[#86868B] mb-1.5">
                  多维表格名称
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newBaseName}
                  onChange={(e) => setNewBaseName(e.target.value)}
                  placeholder="例如：未命名多维表格"
                  className="w-full text-[14px] text-[#1D1D1F] placeholder:text-[#86868B]/60 focus:outline-none"
                />
              </div>

              <p className="text-[11px] text-[#86868B] px-1">
                将自动生成一张空白「数据表 1」，所有字段、视图与记录均由您自主创建与管理。
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewBaseModal(false)}
                  className="px-4 py-2 text-[13px] font-medium text-[#86868B] hover:text-[#1D1D1F] rounded-full"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingBase}
                  className="px-5 py-2 text-[13px] font-semibold bg-[#007AFF] hover:bg-[#0066D6] text-white rounded-full shadow-[0_2px_8px_rgba(0,122,255,0.28)] disabled:opacity-50 ios-press"
                >
                  {creatingBase ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
