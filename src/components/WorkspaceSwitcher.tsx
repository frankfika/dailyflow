/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
const OPEN_PICKER_EVENT = 'dailyflow:open-workspace-picker';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronsUpDown, Check, FolderOpen, FolderPlus, Loader2, Pencil, Trash2, Sparkles } from 'lucide-react';
import { workspacesApi, type Workspace } from '../api/client';
import { ConfirmDialog } from './ConfirmDialog';

interface WorkspaceSwitcherProps {
  language: 'en' | 'zh';
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivate: (id: string) => Promise<void> | void;
  onAdded?: (ws: Workspace) => void;
  onRenamed?: (id: string, name: string) => void;
  onRemoved?: (id: string, nextActiveId: string) => void;
  /** Bump to programmatically open the dropdown (⌘⇧W, UX_DESIGN §12). */
  openSignal?: number;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  /** When true, render only the folder icon as the trigger and anchor the
   * dropdown to the right of the icon (used when the sidebar is collapsed to
   * its 60px icon strip). */
  compact?: boolean;
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
  openSignal,
  showToast,
  compact = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Workspace | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [pickingMode, setPickingMode] = useState<'idle' | 'modal'>('idle');
  const [pickingBusy, setPickingBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const workspacesRef = useRef(workspaces);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  // ⌘⇧W (UX_DESIGN §12) opens the switcher from anywhere in the app.
  useEffect(() => {
    if (openSignal && openSignal > 0) setOpen(true);
  }, [openSignal]);

  // Listen for the global "open workspace picker" event (fired by the
  // top-bar pill in App.tsx). This makes the picker reachable from anywhere
  // in the app, independent of the sidebar state.
  useEffect(() => {
    // ?openPicker=1 in the URL — the user is at the keyboard, clicks a
    // "load with picker open" link, and the modal pops up immediately. This
    // guarantees the picker is reachable even if the user is on a tab where
    // no visible trigger is in view.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openPicker') === '1' || params.get('openWorkspacePicker') === '1') {
        // Open the centered modal so the user has a clear, findable entry
        // point. They click the orange button to fire the native picker —
        // we don't auto-spawn a dialog the user might not see.
      }
    }
    const onOpen = () => setPickingMode('modal');
    const onKey = (e: KeyboardEvent) => {
      // Cmd+Shift+P (or Ctrl+Shift+P on non-Mac) — global hotkey for the
      // workspace picker. Works regardless of which view the user is in.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setPickingMode('modal');
      }
    };
    window.addEventListener(OPEN_PICKER_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_PICKER_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setPickingMode('idle');
      setPickingBusy(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
        setPickingMode('idle');
      }
    };
    // Esc closes the dropdown too — while it is open it covers the whole
    // sidebar rail, so a user pressing Esc with nowhere else to click was
    // stuck (found by the runtime operability audit).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setOpen(false);
      setRenamingId(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
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

  const browseAndAdd = async () => {
    // The single entry point for adding a new workspace: open the macOS
    // system folder picker, then on success add the picked path as a
    // workspace and activate it. There is intentionally no text-input
    // fallback — the user asked for the original native dialog flow and
    // doesn't want to be pushed into typing a path.
    setPickingBusy(true);
    try {
      const picked = await workspacesApi.pickFolder();
      if (picked) {
        const base = picked.split('/').filter(Boolean).pop() || 'Workspace';
        await addAndActivate(picked, base);
        setPickingMode('idle');
        setOpen(false);
      } else {
        // User cancelled the native dialog. Close the modal silently —
        // do not show a fallback input, do not re-prompt.
        setPickingMode('idle');
      }
    } catch (e: any) {
      showToast(
        language === 'zh'
          ? '系统选择框没出来，请重试或检查「自动化 → 辅助功能」权限'
          : 'System folder picker did not appear. Please retry, or check Automation / Accessibility permissions.',
        'error'
      );
    } finally {
      setPickingBusy(false);
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
    if (!ws) return;
    setConfirmRemove(ws);
  };

  const confirmAndRemove = async () => {
    if (!confirmRemove) return;
    setIsRemoving(true);
    try {
      const { activeWorkspaceId: nextActive, cleared } = await workspacesApi.remove(confirmRemove.id);
      onRemoved?.(confirmRemove.id, nextActive);
      setConfirmRemove(null);
      if (cleared) {
        // Last workspace removed — close the menu and let App.tsx pick up the
        // empty state via onRemoved, which triggers a re-check of first-run.
        showToast(
          language === 'zh' ? '已移除，请重新选择一个工作区' : 'Removed. Pick a workspace to continue.',
          'info'
        );
      }
    } catch (e: any) {
      showToast(e.message || (language === 'zh' ? '删除失败' : 'Failed to remove'), 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => void browseAndAdd()}
        disabled={pickingBusy}
        className={
          compact
            ? 'w-full mt-1 mb-2 flex items-center justify-center p-1.5 rounded-md text-text-muted hover:bg-accent/15 hover:text-accent transition-colors disabled:opacity-50'
            : 'w-full mb-2 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-[12px] font-medium text-white bg-accent hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-50'
        }
        title={language === 'zh' ? '选择其他文件夹（直接弹系统选择框）' : 'Add another folder (opens the system folder picker directly)'}
        aria-label={language === 'zh' ? '添加其他文件夹' : 'Add another folder'}
        data-testid="workspace-add-folder-modal"
      >
        {compact ? <FolderPlus className="w-4 h-4" /> : (
          <>
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{language === 'zh' ? '添加其他文件夹' : 'Add another folder'}</span>
          </>
        )}
      </button>
      {!compact && (
        <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted">
          {language === 'zh' ? '工作区' : 'Workspace'}
        </p>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className={
          compact
            ? 'w-full flex items-center justify-center p-2 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 transition-colors group relative'
            : 'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-background/55 hover:bg-background border border-border/70 hover:border-border-strong transition-colors group'
        }
        title={compact ? `${active.name} — ${active.path}` : active.path}
        aria-label={`${language === 'zh' ? '切换工作区' : 'Switch workspace'}: ${active.name}`}
        aria-expanded={open}
        data-testid="workspace-switcher-trigger"
      >
        <div className={`flex items-center ${compact ? '' : 'gap-2 min-w-0'}`}>
          <div className="w-6 h-6 shrink-0 rounded-md bg-accent/10 text-accent flex items-center justify-center">
            <FolderOpen className="w-3.5 h-3.5" />
          </div>
          {!compact && (
            <div className="min-w-0 text-left">
              <div className="text-xs font-semibold text-text-heading truncate">{active.name}</div>
              <div className="text-[10px] text-text-muted/80 truncate font-mono">{active.path}</div>
            </div>
          )}
        </div>
        {!compact && <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={
              compact
                ? 'absolute left-full top-0 ml-2 w-72 z-50 bg-background border border-border rounded-md shadow-lg overflow-hidden'
                : 'absolute left-0 right-0 top-full mt-1.5 z-50 bg-background border border-border rounded-md shadow-lg overflow-hidden'
            }
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
                          if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                            e.stopPropagation();
                            setRenamingId(null);
                          }
                        }}
                        onBlur={() => {
                          if (renamingId) handleRename(renamingId);
                          setRenamingId(null);
                        }}
                        className="w-full bg-surface border border-accent/40 rounded px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <>
                        <div className="text-xs font-medium text-text-heading truncate">{ws.name}</div>
                        <div className="text-[11px] text-text-muted/70 truncate font-mono">{ws.path}</div>
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
                  </div>
                </div>
              ))}

              {/* Suggestions section */}
              {(discovering || candidates.length > 0) && (
                <div className="mt-1 pt-1 border-t border-border/60">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] uppercase tracking-wider text-text-muted/80">
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
                            <div className="text-[11px] text-text-muted/70 truncate font-mono">{c.path}</div>
                          </div>
                          {busyId === '__new__' ? (
                            <Loader2 className="w-3 h-3 animate-spin text-accent" />
                          ) : (
                            <span className="text-[12px] font-bold text-accent opacity-0 group-hover/cand:opacity-100 transition-opacity">+</span>
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
                onClick={() => void browseAndAdd()}
                disabled={busyId === '__new__' || pickingBusy}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-surface hover:text-accent transition-colors disabled:opacity-50"
                data-testid="workspace-add-folder-inline"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {language === 'zh' ? '添加其他文件夹…' : 'Add another folder…'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered modal for picking a folder — works regardless of sidebar
          state and never gets clipped behind other apps (unlike native dialogs). */}
      <AnimatePresence>
        {pickingMode === 'modal' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
            onClick={() => { if (!pickingBusy) setPickingMode('idle'); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-lg border border-border bg-surface-white p-6 shadow-xl"
              onClick={e => e.stopPropagation()}
              data-testid="folder-picker-modal"
            >
              <h2 className="text-lg font-semibold text-text-heading mb-1">
                {language === 'zh' ? '添加工作区文件夹' : 'Add workspace folder'}
              </h2>
              <p className="text-xs text-text-muted mb-5">
                {language === 'zh'
                  ? '点下面的按钮，macOS 会弹一个系统选择框；选完直接进工作区列表。'
                  : 'Click the button below — macOS will pop up a system folder picker. Your choice is added immediately.'}
              </p>

              {/* Single primary action: native macOS folder picker. The text
                  input fallback has been removed; the user explicitly asked
                  for the original native-dialog flow with no typing. */}
              <button
                type="button"
                onClick={() => void browseAndAdd()}
                disabled={pickingBusy}
                data-testid="folder-picker-native"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {pickingBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderOpen className="w-4 h-4" />
                )}
                {language === 'zh' ? '选择文件夹…' : 'Choose folder…'}
              </button>
              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={() => setPickingMode('idle')}
                  disabled={pickingBusy}
                  className="px-3 py-1.5 text-sm rounded-md border border-border text-text-muted hover:bg-surface transition-colors disabled:opacity-50"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        show={!!confirmRemove}
        title={language === 'zh' ? '移除工作区' : 'Remove Workspace'}
        message={
          workspaces.length <= 1
            ? (language === 'zh'
                ? `「${confirmRemove?.name}」是当前唯一的工作区。从列表移除后，DailyFlow 会回到首次运行引导。磁盘上的文件不会被删除。`
                : `"${confirmRemove?.name}" is your only workspace. After removing it, DailyFlow will return to the first-run setup. Files on disk are not deleted.`)
            : (language === 'zh'
                ? `从列表移除「${confirmRemove?.name}」？磁盘上的文件不会被删除。`
                : `Remove "${confirmRemove?.name}" from the list? Files on disk are not deleted.`)
        }
        confirmText={language === 'zh' ? '移除' : 'Remove'}
        cancelText={language === 'zh' ? '取消' : 'Cancel'}
        isLoading={isRemoving}
        variant="danger"
        onConfirm={confirmAndRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
