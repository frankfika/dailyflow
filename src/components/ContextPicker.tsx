/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, FileText, Folder, Search, Type } from 'lucide-react';
import type { ContextItem } from '../types/chat';

interface ContextPickerProps {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  onSelect: (item: ContextItem) => void;
  onClose: () => void;
}

export function ContextPicker({ language, tasks, notes, filesMap, onSelect, onClose }: ContextPickerProps) {
  const [tab, setTab] = useState<'tasks' | 'notes' | 'projects' | 'custom'>('tasks');
  const [search, setSearch] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customText, setCustomText] = useState('');

  const dates = Object.keys(filesMap).sort().reverse();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  const handleAddCustom = () => {
    if (!customLabel.trim() || !customText.trim()) return;
    onSelect({
      id: `ctx_custom_${Date.now()}`,
      type: 'custom-text',
      label: customLabel.trim(),
      data: { text: customText.trim() },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface w-full max-w-xl max-h-[80vh] rounded-lg shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-heading">
            {language === 'zh' ? '添加上下文' : 'Add Context'}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex items-center gap-1 border-b border-border">
          {[
            { value: 'tasks', label: language === 'zh' ? '任务' : 'Tasks', icon: Calendar },
            { value: 'notes', label: language === 'zh' ? '笔记' : 'Notes', icon: FileText },
            { value: 'projects', label: language === 'zh' ? '项目' : 'Projects', icon: Folder },
            { value: 'custom', label: language === 'zh' ? '自定义' : 'Custom', icon: Type },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value as any)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
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
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {tab === 'tasks' && (
            <>
              <button
                onClick={() => onSelect({
                  id: 'ctx_today_tasks',
                  type: 'today-tasks',
                  label: language === 'zh' ? '今日任务' : "Today's Tasks",
                  data: {},
                })}
                className="w-full flex items-center gap-3 px-3 py-3 text-left border border-border rounded hover:border-accent/30 hover:bg-surface-white transition-colors"
              >
                <Calendar className="w-4 h-4 text-accent" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-text-heading">
                    {language === 'zh' ? '今日任务' : "Today's Tasks"}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {tasks.length} {language === 'zh' ? '个任务' : 'tasks'}
                  </div>
                </div>
              </button>

              {filteredDates.map(date => (
                <button
                  key={date}
                  onClick={() => onSelect({
                    id: `ctx_date_${date}`,
                    type: 'date-tasks',
                    label: date,
                    data: { date },
                  })}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left border border-border rounded hover:border-accent/30 hover:bg-surface-white transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-text-heading">{date}</div>
                    <div className="text-[10px] text-text-muted">
                      {(filesMap[date] || '').split('\n').filter(l => l.trim().startsWith('- [')).length} {language === 'zh' ? '项' : 'items'}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {tab === 'notes' && (
            filteredNotes.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">
                {language === 'zh' ? '暂无笔记' : 'No notes'}
              </div>
            ) : filteredNotes.map((note: any) => (
              <button
                key={note.id}
                onClick={() => onSelect({
                  id: `ctx_note_${note.id}`,
                  type: 'note',
                  label: note.title || (language === 'zh' ? '无标题' : 'Untitled'),
                  data: { noteId: note.id },
                })}
                className="w-full flex items-start gap-3 px-3 py-2 text-left border border-border rounded hover:border-accent/30 hover:bg-surface-white transition-colors"
              >
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
            ))
          )}

          {tab === 'projects' && (
            filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">
                {language === 'zh' ? '暂无项目' : 'No projects'}
              </div>
            ) : filteredProjects.map(project => (
              <button
                key={project}
                onClick={() => onSelect({
                  id: `ctx_project_${project}`,
                  type: 'project',
                  label: project,
                  data: { projectName: project },
                })}
                className="w-full flex items-center gap-3 px-3 py-2 text-left border border-border rounded hover:border-accent/30 hover:bg-surface-white transition-colors"
              >
                <Folder className="w-3.5 h-3.5 text-text-muted" />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-text-heading">{project}</div>
                  <div className="text-[10px] text-text-muted">
                    {tasks.filter((t: any) => t.project === project || t.tags?.includes(project)).length} {language === 'zh' ? '项' : 'items'}
                  </div>
                </div>
              </button>
            ))
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
                {language === 'zh' ? '添加' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
