/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect } from 'react';
import { Tag, FileText, CheckSquare, Calendar, Search, X } from 'lucide-react';
import { notesApi, filesApi } from '../api/client';
import type { NoteData } from '../api/client';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
}

interface TagsProps {
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
}

export function Tags({ activeContext, language }: TagsProps) {
  const [allNotes, setAllNotes] = useState<NoteData[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Load all notes and tasks
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load all notes
        const notes = await notesApi.getAll();
        setAllNotes(notes.filter(n => n.context === activeContext));

        // Load all tasks from all daily files
        const files = await filesApi.list();
        const tasksPromises = files.map(f => filesApi.get(f));
        const results = await Promise.all(tasksPromises);

        const tasks: Task[] = [];
        results.forEach(data => {
          if (data) {
            (data.tasks as Task[]).forEach(t => {
              // Filter by context
              const taskTags = t.tags || [];
              const hasWorkTag = taskTags.includes('work');
              const hasLifeTag = taskTags.includes('life');

              if (activeContext === 'work') {
                if (hasWorkTag || (!hasWorkTag && !hasLifeTag)) {
                  tasks.push({ ...t, source_date: t.source_date || data.date });
                }
              } else {
                if (hasLifeTag) {
                  tasks.push({ ...t, source_date: t.source_date || data.date });
                }
              }
            });
          }
        });
        setAllTasks(tasks);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [activeContext]);

  // Extract all tags from notes and tasks
  const allTagsData = useMemo(() => {
    const tagMap = new Map<string, { notes: NoteData[]; tasks: Task[] }>();
    const systemTags = ['work', 'life', 'delayed', 'tasks', 'migrated'];

    // Collect tags from notes
    allNotes.forEach(note => {
      note.tags.forEach(tag => {
        if (!systemTags.includes(tag)) {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, { notes: [], tasks: [] });
          }
          tagMap.get(tag)!.notes.push(note);
        }
      });
    });

    // Collect tags from tasks
    allTasks.forEach(task => {
      (task.tags || []).forEach(tag => {
        if (!systemTags.includes(tag)) {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, { notes: [], tasks: [] });
          }
          tagMap.get(tag)!.tasks.push(task);
        }
      });
    });

    return Array.from(tagMap.entries())
      .map(([tag, data]) => ({
        tag,
        notesCount: data.notes.length,
        tasksCount: data.tasks.length,
        totalCount: data.notes.length + data.tasks.length,
        notes: data.notes,
        tasks: data.tasks,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [allNotes, allTasks]);

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return allTagsData;
    const query = searchQuery.toLowerCase();
    return allTagsData.filter(t => t.tag.toLowerCase().includes(query));
  }, [allTagsData, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-muted font-sans">
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-serif font-light text-text-heading tracking-tight italic mb-2">
          {language === 'zh' ? '标签视图' : 'Tags View'}
        </h1>
        <p className="text-text-muted font-sans text-sm">
          {language === 'zh'
            ? '按标签组织查看所有笔记和任务'
            : 'View all notes and tasks organized by tags'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={language === 'zh' ? '搜索标签...' : 'Search tags...'}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-white border border-border text-sm outline-none focus:border-accent transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tags Grid */}
      {filteredTags.length === 0 ? (
        <div className="py-20 text-center bg-surface-white rounded-[32px] border border-border/50 shadow-sm">
          <Tag className="w-12 h-12 text-text-muted mx-auto mb-6 opacity-30 stroke-[1.5]" />
          <h3 className="font-serif italic text-2xl text-text-muted font-light">
            {searchQuery
              ? (language === 'zh' ? '没有匹配的标签' : 'No matching tags')
              : (language === 'zh' ? '暂无标签' : 'No tags yet')}
          </h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTags.map(tagData => (
              <motion.div
                key={tagData.tag}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-white rounded-[24px] border border-border shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedTag(selectedTag === tagData.tag ? null : tagData.tag)}
              >
                {/* Tag Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                      <Tag className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-heading text-lg">
                        #{tagData.tag}
                      </h3>
                      <p className="text-xs text-text-muted font-sans">
                        {tagData.totalCount} {language === 'zh' ? '项' : 'items'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="text-text-muted">
                      {tagData.notesCount} {language === 'zh' ? '笔记' : 'notes'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckSquare className="w-4 h-4 text-green-500" />
                    <span className="text-text-muted">
                      {tagData.tasksCount} {language === 'zh' ? '任务' : 'tasks'}
                    </span>
                  </div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                  {selectedTag === tagData.tag && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 border-t border-border space-y-3 max-h-[400px] overflow-y-auto">
                        {/* Notes */}
                        {tagData.notes.length > 0 && (
                          <div>
                            <h4 className="text-xs uppercase tracking-widest font-bold text-text-muted mb-2">
                              {language === 'zh' ? '笔记' : 'Notes'}
                            </h4>
                            <div className="space-y-2">
                              {tagData.notes.map(note => (
                                <div
                                  key={note.id}
                                  className="p-3 rounded-lg bg-surface border border-border/50 hover:border-accent/40 transition-colors"
                                >
                                  <p className="text-sm font-semibold text-text-heading truncate">
                                    {note.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Calendar className="w-3 h-3 text-text-muted" />
                                    <span className="text-xs text-text-muted">{note.date}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tasks */}
                        {tagData.tasks.length > 0 && (
                          <div>
                            <h4 className="text-xs uppercase tracking-widest font-bold text-text-muted mb-2">
                              {language === 'zh' ? '任务' : 'Tasks'}
                            </h4>
                            <div className="space-y-2">
                              {tagData.tasks.map(task => (
                                <div
                                  key={task.id}
                                  className="p-3 rounded-lg bg-surface border border-border/50 hover:border-accent/40 transition-colors"
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`w-4 h-4 rounded border mt-0.5 shrink-0 ${
                                      task.status === 'done'
                                        ? 'bg-accent border-accent'
                                        : 'border-border/80'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-semibold truncate ${
                                        task.status === 'done'
                                          ? 'text-text-muted line-through'
                                          : 'text-text-heading'
                                      }`}>
                                        {task.title}
                                      </p>
                                      {task.source_date && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <Calendar className="w-3 h-3 text-text-muted" />
                                          <span className="text-xs text-text-muted">
                                            {task.source_date}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

