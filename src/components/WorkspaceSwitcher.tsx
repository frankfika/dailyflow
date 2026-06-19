/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronsUpDown, Check, FolderOpen, FolderPlus, Loader2, Pencil, Trash2, Sparkles } from 'lucide-react';
import { workspacesApi, type Workspace } from '../api/client';

interface WorkspaceSwitcherProps {
  language: 'en' | 'zh';
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivate: (id: string) => Promise<void> | void;
  onAdded?: (ws: Workspace) => void;
  onRenamed?: (id: string, name: string) => void;
  onRemoved?: (id: string, nextActiveId: string) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

interface Candidate {
  path: string;
  name: string;
}

export function WorkspaceSwitcher({
  language,
  workspaces,
  activeWorkspaceId,
  onActivate,
  onAdded,
  onRenamed,
  onRemoved,
  showToast,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef(workspaces);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Auto-discover candidates whenever the dropdown opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDiscovering(true);
    workspacesApi.discover()
      .then(({ candidates }) => {
        if (!cancelled) setCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });
    return () => { cancelled = true; };
  }, [open, workspaces.length]);

  const handleActivate = async (id: string) => {
    if (id === activeWorkspaceId) {
      setOpen(false);
      return;
    }
    setBusyId(id);
    try {
      await onActivate(id);
      setOpen(false);
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '切换失败' : 'Failed to switch'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const addAndActivate = async (folderPath: string, name?: string) => {
    setBusyId('__new__');
    try {
      const ws = await workspacesApi.create(name || '', folderPath);
      const alreadyInList = workspacesRef.current.some(
        w => w.id === ws.id || w.path === folderPath
      );
      if (!alreadyInList) {
        onAdded?.(ws);
      } else {
        showToast(
          language === 'zh' ? `已切换到现有 Notebook「${ws.name}」` : `Switched to existing notebook "${ws.name}"`,
          'success'
        );
      }
      await onActivate(ws.id);
      setOpen(false);
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '添加失败' : 'Failed to add'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePickAndAdd = async () => {
    try {
      const picked = await workspacesApi.pickFolder();
      if (!picked) return;
      const base = picked.split('/').filter(Boolean).pop() || 'Workspace';
      await addAndActivate(picked, base);
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '打开文件夹选择器失败' : 'Failed to open folder picker'), 'error');
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await workspacesApi.rename(id, renameValue.trim());
      onRenamed?.(id, renameValue.trim());
      setRenamingId(null);
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '重命名失败' : 'Failed to rename'), 'error');
    }
  };

  const handleRemove = async (id: string) => {
    const ws = workspaces.find(w => w.id === id);
    const confirmMsg = language === 'zh'
      ? `从列表移除「${ws?.name}」？磁盘上的文件不会被删除。`
      : `Remove "${ws?.name}" from the list? Files on disk are not deleted.`;
    if (!confirm(confirmMsg)) return;
    try {
      const { activeWorkspaceId: nextActive } = await workspacesApi.remove(id);
      onRemoved?.(id, nextActive);
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '删除失败' : 'Failed to remove'), 'error');
    }
  };

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-background border border-transparent hover:border-border transition-colors group"
        title={active.path}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 shrink-0 rounded-md bg-accent/10 text-accent flex items-center justify-center">
            <FolderOpen className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-xs font-semibold text-text-heading truncate">{active.name}</div>
            <div className="text-[10px] text-text-muted/80 truncate font-mono">{active.path}</div>
          </div>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-background border border-border rounded-md shadow-lg overflow-hidden"
          >
            <div className="max-h-80 overflow-y-auto py-1">
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  className={`group/row flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md text-xs cursor-pointer ${ws.id === activeWorkspaceId ? 'bg-accent/10' : 'hover:bg-surface'}`}
                  onClick={() => renamingId !== ws.id && handleActivate(ws.id)}
                >
                  <div className="w-4 shrink-0 flex items-center justify-center">
                    {busyId === ws.id ? (
                      <Loader2 className="w-3 h-3 animate-spin text-accent" />
                    ) : ws.id === activeWorkspaceId ? (
                      <Check className="w-3 h-3 text-accent" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {renamingId === ws.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRename(ws.id);
                          if (e.key === 'Escape' && !e.nativeEvent.isComposing) setRenamingId(null);
                        }}
                        onBlur={() => setRenamingId(null)}
                        className="w-full bg-surface border border-accent/40 rounded px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <>
                        <div className="text-xs font-medium text-text-heading truncate">{ws.name}</div>
                        <div className="text-[10px] text-text-muted/70 truncate font-mono">{ws.path}</div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setRenamingId(ws.id);
                        setRenameValue(ws.name);
                      }}
                      className="p-1 rounded hover:bg-surface-white text-text-muted hover:text-accent"
                      title={language === 'zh' ? '重命名' : 'Rename'}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {workspaces.length > 1 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleRemove(ws.id);
                        }}
                        className="p-1 rounded hover:bg-surface-white text-text-muted hover:text-red-500"
                        title={language === 'zh' ? '从列表移除' : 'Remove from list'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Suggestions section */}
              {(discovering || candidates.length > 0) && (
                <div className="mt-1 pt-1 border-t border-border/60">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-wider text-text-muted/80">
                    <Sparkles className="w-3 h-3" />
                    {language === 'zh' ? '本地发现' : 'Found on this Mac'}
                    {discovering && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                  </div>
                  {!discovering && candidates.length === 0 ? null : (
                    <div className="max-h-40 overflow-y-auto">
                      {candidates.map(c => (
                        <button
                          key={c.path}
                          onClick={() => addAndActivate(c.path, c.name)}
                          disabled={busyId === '__new__'}
                          className="group/cand w-full flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md text-xs hover:bg-surface text-left disabled:opacity-50"
                        >
                          <FolderOpen className="w-3 h-3 text-text-muted shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-text-heading truncate">{c.name}</div>
                            <div className="text-[10px] text-text-muted/70 truncate font-mono">{c.path}</div>
                          </div>
                          {busyId === '__new__' ? (
                            <Loader2 className="w-3 h-3 animate-spin text-accent" />
                          ) : (
                            <span className="text-[11px] font-bold text-accent opacity-0 group-hover/cand:opacity-100 transition-opacity">+</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border">
              <button
                onClick={handlePickAndAdd}
                disabled={busyId === '__new__'}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-surface hover:text-accent transition-colors disabled:opacity-50"
              >
                {busyId === '__new__' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5" />
                )}
                {language === 'zh' ? '选择其他文件夹…' : 'Choose another folder…'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
