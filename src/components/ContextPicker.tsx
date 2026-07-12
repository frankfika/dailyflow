/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, FileText, Folder, Search, Type, Check, CheckCircle2, Mic } from 'lucide-react';
import type { ContextItem } from '../types/chat';

interface ContextPickerProps {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  selectedItems: ContextItem[];
  onSelect: (item: ContextItem) => void;
  onDeselect: (id: string) => void;
  onClose: () => void;
}

export function ContextPicker({
  language,
  tasks,
  notes,
  filesMap,
  selectedItems,
  onSelect,
  onDeselect,
  onClose,
}: ContextPickerProps) {
  const [tab, setTab] = useState<'tasks' | 'notes' | 'meetings' | 'projects' | 'custom'>('tasks');
  const [search, setSearch] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customText, setCustomText] = useState('');
  /** Phase 2 M6: when on, the meetings tab pre-selects the last 7 days of meeting_note. */
  const [autoInclude7Days, setAutoInclude7Days] = useState(true);
  // Track whether we've already fired the one-shot auto-include for this
  // picker mount, so user-driven deselects aren't undone on re-render.
  const didAutoIncludeRef = useRef(false);

  const dates = Object.keys(filesMap).sort().reverse();
  const selectedIds = useMemo(() => new Set(selectedItems.map(i => i.id)), [selectedItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      const isEditing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing || e.isComposing) return;
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /**
   * Phase 2 M6: on first render of the meetings tab, when auto-include is
   * on, automatically pre-select every meeting_note from the last 7 days.
   * The user can deselect any they don't want; the effect does not re-fire.
   */
  useEffect(() => {
    if (didAutoIncludeRef.current) return;
    if (tab !== 'meetings') return;
    if (!autoInclude7Days) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = notes.filter((n: any) => {
      if (n.type !== 'meeting_note') return false;
      if (!n.date) return false;
      const ts = new Date(n.date + 'T00:00:00').getTime();
      if (Number.isNaN(ts)) return false;
      return ts >= cutoff;
    });
    if (recent.length === 0) return;
    didAutoIncludeRef.current = true;
    for (const note of recent) {
      const id = `ctx_note_${note.id}`;
      if (selectedIds.has(id)) continue;
      onSelect({
        id,
        type: 'note',
        label: note.title || (language === 'zh' ? '无标题会议' : 'Untitled meeting'),
        data: { noteId: note.id },
      });
    }
  }, [tab, autoInclude7Days, notes, selectedIds, language, onSelect]);

  const projects = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t: any) => {
      if (t.project) set.add(t.project);
      t.tags?.forEach((tag: string) => set.add(tag));
    });
    return Array.from(set).filter(p => !!p && p !== 'delayed');
  }, [tasks]);

  const filteredNotes = useMemo(() => {
    if (!search) return notes.slice(0, 30);
    return notes.filter((n: any) =>
      n.title?.toLowerCase().includes(search.toLowerCase()) ||
      (n.body || n.content || '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 30);
  }, [notes, search]);

  const filteredDates = useMemo(() => {
    if (!search) return dates.slice(0, 30);
    return dates.filter(d => d.includes(search)).slice(0, 30);
  }, [dates, search]);

  const filteredProjects = useMemo(() => {
    if (!search) return projects;
    return projects.filter(p => p.toLowerCase().includes(search.toLowerCase()));
  }, [projects, search]);

  const toggleItem = (item: ContextItem) => {
    if (selectedIds.has(item.id)) {
      onDeselect(item.id);
    } else {
      onSelect(item);
    }
  };

  const handleAddCustom = () => {
    if (!customLabel.trim() || !customText.trim()) return;
    onSelect({
      id: `ctx_custom_${Date.now()}`,
      type: 'custom-text',
      label: customLabel.trim(),
      data: { text: customText.trim() },
    });
    setCustomLabel('');
    setCustomText('');
  };

  const totalCount = selectedItems.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="bg-background w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface-white">
          <div>
            <h3 className="text-base font-bold text-text-heading">
              {language === 'zh' ? '挂载上下文' : 'Add Context'}
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              {language === 'zh'
                ? '可多选——选中的项目会作为参考资料一起发给 AI'
                : 'Pick multiple — selected items will be sent to AI as reference'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded hover:bg-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected pills row — always visible */}
        <div className="px-5 py-3 border-b border-border bg-accent/5 min-h-[52px] flex items-center gap-1.5 flex-wrap">
          {totalCount === 0 ? (
            <span className="text-xs text-text-muted italic">
              {language === 'zh' ? '尚未选中任何上下文' : 'Nothing selected yet'}
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3" />
                {language === 'zh' ? `已选 ${totalCount}` : `${totalCount} selected`}
              </span>
              <span className="text-text-muted/50 mx-1">·</span>
              {selectedItems.map(item => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-surface-white border border-accent/30 rounded-full"
                >
                  {item.type === 'today-tasks' && <Calendar className="w-3 h-3 text-accent" />}
                  {item.type === 'date-tasks' && <Calendar className="w-3 h-3 text-accent" />}
                  {item.type === 'note' && <FileText className="w-3 h-3 text-accent" />}
                  {item.type === 'project' && <Folder className="w-3 h-3 text-accent" />}
                  {item.type === 'custom-text' && <Type className="w-3 h-3 text-accent" />}
                  <span className="text-text-heading max-w-[140px] truncate">{item.label}</span>
                  <button
                    onClick={() => onDeselect(item.id)}
                    className="text-text-muted hover:text-red-500 transition-colors ml-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="px-5 flex items-center gap-1 border-b border-border bg-surface-white">
          {[
            { value: 'tasks', label: language === 'zh' ? '任务' : 'Tasks', icon: Calendar },
            { value: 'notes', label: language === 'zh' ? '笔记' : 'Notes', icon: FileText },
            { value: 'meetings', label: language === 'zh' ? '会议' : 'Meetings', icon: Mic },
            { value: 'projects', label: language === 'zh' ? '项目' : 'Projects', icon: Folder },
            { value: 'custom', label: language === 'zh' ? '自定义' : 'Custom', icon: Type },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                  tab === t.value
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-heading'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        {tab !== 'custom' && (
          <div className="px-5 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={language === 'zh' ? '搜索...' : 'Search...'}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'tasks' && (
            <>
              {/* Section: Today's Tasks (as a whole) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    {language === 'zh' ? '今日汇总' : "Today's Summary"}
                  </span>
                  <span className="h-px bg-border flex-1" />
                </div>
                {(() => {
                  const item: ContextItem = {
                    id: 'ctx_today_tasks',
                    type: 'today-tasks',
                    label: language === 'zh' ? '今日任务' : "Today's Tasks",
                    data: {},
                  };
                  const sel = selectedIds.has(item.id);
                  return (
                    <button
                      onClick={() => toggleItem(item)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-left border-2 rounded-lg transition-all ${
                        sel
                          ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                          : 'border-border hover:border-accent/40 hover:bg-surface-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                        sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                      }`}>
                        {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-text-heading">
                          {language === 'zh' ? '今日任务' : "Today's Tasks"}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {tasks.length} {language === 'zh' ? '个任务' : 'tasks'}
                        </div>
                      </div>
                    </button>
                  );
                })()}
              </div>

              {/* Section: Individual Tasks */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    {language === 'zh' ? '单个任务' : 'Individual Tasks'}
                  </span>
                  <span className="h-px bg-border flex-1" />
                </div>
                <div className="space-y-1.5">
                  {tasks.filter((t: any) => t.status !== 'done').slice(0, 50).map((task: any) => {
                    const item: ContextItem = {
                      id: `ctx_task_${task.id}`,
                      type: 'today-tasks',
                      label: task.title,
                      data: { taskId: task.id },
                    };
                    const sel = selectedIds.has(item.id);
                    return (
                      <button
                        key={task.id}
                        onClick={() => toggleItem(item)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                          sel
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                            : 'border-border hover:border-accent/40 hover:bg-surface-white'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                          sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                        }`}>
                          {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          task.status === 'done' ? 'bg-accent border-accent' : 'border-border'
                        }`}>
                          {task.status === 'done' && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs truncate ${task.status === 'done' ? 'line-through text-text-muted' : 'text-text-heading font-medium'}`}>
                            {task.title}
                          </div>
                          {task.tags?.length > 0 && (
                            <div className="text-[10px] text-text-muted mt-0.5 truncate">
                              {task.tags.slice(0, 3).map((t: string) => `#${t}`).join(' ')}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section: Historical Dates */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    {language === 'zh' ? '历史日期' : 'Past Dates'}
                  </span>
                  <span className="h-px bg-border flex-1" />
                </div>
                <div className="space-y-1.5">
                  {filteredDates.slice(0, 20).map(date => {
                    const item: ContextItem = {
                      id: `ctx_date_${date}`,
                      type: 'date-tasks',
                      label: date,
                      data: { date },
                    };
                    const sel = selectedIds.has(item.id);
                    return (
                      <button
                        key={date}
                        onClick={() => toggleItem(item)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                          sel
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                            : 'border-border hover:border-accent/40 hover:bg-surface-white'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                          sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                        }`}>
                          {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="font-bold text-text-heading">{date}</div>
                          <div className="text-[10px] text-text-muted">
                            {(filesMap[date] || '').split('\n').filter(l => l.trim().startsWith('- [')).length} {language === 'zh' ? '项' : 'items'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'notes' && (
            filteredNotes.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">
                {language === 'zh' ? '暂无笔记' : 'No notes'}
              </div>
            ) : filteredNotes.map((note: any) => {
              const item: ContextItem = {
                id: `ctx_note_${note.id}`,
                type: 'note',
                label: note.title || (language === 'zh' ? '无标题' : 'Untitled'),
                data: { noteId: note.id },
              };
              const sel = selectedIds.has(item.id);
              return (
                <button
                  key={note.id}
                  onClick={() => toggleItem(item)}
                  className={`w-full flex items-start gap-3 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                    sel
                      ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                      : 'border-border hover:border-accent/40 hover:bg-surface-white'
                  }`}
                >
                  <div className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                    sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                  }`}>
                    {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </div>
                  <FileText className="w-3.5 h-3.5 text-text-muted mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-text-heading truncate">
                      {note.title || (language === 'zh' ? '无标题' : 'Untitled')}
                    </div>
                    <div className="text-[10px] text-text-muted truncate">
                      {(note.body || note.content || '').slice(0, 60)}
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {tab === 'meetings' && (() => {
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const isRecent = (n: any) => {
              if (!n.date) return false;
              const ts = new Date(n.date + 'T00:00:00').getTime();
              return !Number.isNaN(ts) && ts >= cutoff;
            };
            const meetingNotes = notes
              .filter((n: any) => n.type === 'meeting_note')
              .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
            const recentCount = meetingNotes.filter(isRecent).length;
            const filtered = !search
              ? meetingNotes.slice(0, 30)
              : meetingNotes.filter((n: any) => {
                  const q = search.toLowerCase();
                  return n.title?.toLowerCase().includes(q) ||
                    (n.body || '').toLowerCase().includes(q) ||
                    (n.participants || []).some((p: string) => p.toLowerCase().includes(q));
                }).slice(0, 30);
            return (
              <>
                {/* Phase 2 M6: auto-include toggle */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-accent/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                    <div className="text-[11px] text-text-heading">
                      {language === 'zh'
                        ? `自动包含: 最近 7 天 (${recentCount} 场)`
                        : `Auto-include: last 7 days (${recentCount} meeting${recentCount === 1 ? '' : 's'})`}
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoInclude7Days(v => !v)}
                    role="switch"
                    aria-checked={autoInclude7Days}
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors flex-shrink-0 ${
                      autoInclude7Days ? 'bg-accent' : 'bg-border'
                    }`}
                    title={language === 'zh' ? '开启后, 进入会议 tab 自动勾选最近 7 天' : 'When on, opening the Meetings tab pre-selects the last 7 days'}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        autoInclude7Days ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-xs">
                    {language === 'zh' ? '暂无会议笔记' : 'No meeting notes yet'}
                  </div>
                ) : filtered.map((note: any) => {
                  const item: ContextItem = {
                    id: `ctx_note_${note.id}`,
                    type: 'note',
                    label: note.title || (language === 'zh' ? '无标题会议' : 'Untitled meeting'),
                    data: { noteId: note.id },
                  };
                  const sel = selectedIds.has(item.id);
                  return (
                    <button
                      key={note.id}
                      onClick={() => toggleItem(item)}
                      className={`w-full flex items-start gap-3 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                        sel
                          ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                          : 'border-border hover:border-accent/40 hover:bg-surface-white'
                      }`}
                    >
                      <div className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                        sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                      }`}>
                        {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                      <Mic className="w-3.5 h-3.5 text-text-muted mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-text-heading truncate">
                          {note.title || (language === 'zh' ? '无标题会议' : 'Untitled meeting')}
                        </div>
                        <div className="text-[10px] text-text-muted truncate">
                          {note.date}{note.time ? ` · ${note.time}` : ''}
                          {note.participants?.length ? ` · ${note.participants.join(', ')}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            );
          })()}

          {tab === 'projects' && (
            filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">
                {language === 'zh' ? '暂无项目' : 'No projects'}
              </div>
            ) : filteredProjects.map(project => {
              const item: ContextItem = {
                id: `ctx_project_${project}`,
                type: 'project',
                label: project,
                data: { projectName: project },
              };
              const sel = selectedIds.has(item.id);
              return (
                <button
                  key={project}
                  onClick={() => toggleItem(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left border-2 rounded-lg transition-all ${
                    sel
                      ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                      : 'border-border hover:border-accent/40 hover:bg-surface-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                    sel ? 'bg-accent text-white scale-110' : 'border-2 border-border bg-surface'
                  }`}>
                    {sel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </div>
                  <Folder className="w-3.5 h-3.5 text-text-muted" />
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-text-heading">{project}</div>
                    <div className="text-[10px] text-text-muted">
                      {tasks.filter((t: any) => t.project === project || t.tags?.includes(project)).length} {language === 'zh' ? '项' : 'items'}
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {tab === 'custom' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  {language === 'zh' ? '标签' : 'Label'}
                </label>
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder={language === 'zh' ? '例如：背景资料' : 'e.g. Background info'}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-muted mb-1.5">
                  {language === 'zh' ? '内容' : 'Content'}
                </label>
                <textarea
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  placeholder={language === 'zh' ? '粘贴或输入文本...' : 'Paste or type text...'}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-border rounded bg-surface-white focus:outline-none focus:border-accent resize-none font-mono"
                />
              </div>
              <button
                onClick={handleAddCustom}
                disabled={!customLabel.trim() || !customText.trim()}
                className="w-full px-3 py-2 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {language === 'zh' ? '添加到上下文' : 'Add to context'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-surface-white">
          <span className="text-xs text-text-muted">
            {totalCount === 0
              ? (language === 'zh' ? '点击列表项加入上下文' : 'Click items to add')
              : (language === 'zh' ? `${totalCount} 项已加入上下文` : `${totalCount} item${totalCount > 1 ? 's' : ''} added`)}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            {language === 'zh' ? '完成' : 'Done'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
