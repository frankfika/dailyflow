/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion } from 'motion/react';
import { X, Plus, Sparkles, Loader2, Calendar, ChevronDown, CornerUpRight, Trash2, Repeat } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { TagInput } from './TagInput';
import { tasksApi, filesApi, recurringApi, type RecurrenceRule } from '../api/client';

type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
};

interface TaskInputPanelProps {
  showTaskInput: boolean;
  setShowTaskInput: (v: boolean) => void;
  showBrainDump: boolean;
  setShowBrainDump: (v: boolean) => void;
  language: 'en' | 'zh';
  newTaskTitle: string;
  setNewTaskTitle: (v: string) => void;
  newTaskTagsList: string[];
  setNewTaskTagsList: (v: string[] | ((prev: string[]) => string[])) => void;
  tagInputValue: string;
  setTagInputValue: (v: string) => void;
  newTaskDeadline: string;
  setNewTaskDeadline: (v: string) => void;
  brainDumpText: string;
  setBrainDumpText: (v: string) => void;
  isProcessingBrainDump: boolean;
  processBrainDump: () => Promise<void>;
  currentFileDate: string;
  activeContext: 'work' | 'life';
  categories: string[];
  systemTags: string[];
  setTasks: (v: Task[] | ((prev: Task[]) => Task[])) => void;
  setMarkdown: (v: string) => void;
  setLastSyncedMD: (v: string) => void;
  setFilesMap: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  setLastAddedCategory?: (v: string | null) => void;
}

export function TaskInputPanel({
  showTaskInput,
  setShowTaskInput,
  showBrainDump,
  setShowBrainDump,
  language,
  newTaskTitle,
  setNewTaskTitle,
  newTaskTagsList,
  setNewTaskTagsList,
  tagInputValue,
  setTagInputValue,
  newTaskDeadline,
  setNewTaskDeadline,
  brainDumpText,
  setBrainDumpText,
  isProcessingBrainDump,
  processBrainDump,
  currentFileDate,
  activeContext,
  categories,
  systemTags,
  setTasks,
  setMarkdown,
  setLastSyncedMD,
  setFilesMap,
  showToast,
  setLastAddedCategory,
}: TaskInputPanelProps) {
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [showRecurrenceMenu, setShowRecurrenceMenu] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const recurrenceRef = useRef<HTMLDivElement>(null);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    if (!showTaskInput) {
      setShowDetails(false);
      setShowRecurrenceMenu(false);
    }
  }, [showTaskInput]);

  useEffect(() => {
    if (!showTaskInput) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        setShowTaskInput(false);
        setShowBrainDump(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showTaskInput]);

  useEffect(() => {
    if (!showRecurrenceMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (recurrenceRef.current && !recurrenceRef.current.contains(e.target as Node)) {
        setShowRecurrenceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showRecurrenceMenu]);

  if (!showTaskInput) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/10 z-40 sm:hidden"
        onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] space-y-4 overflow-y-auto overscroll-contain p-4 sm:sticky sm:bottom-6 sm:px-8 lg:px-12"
      >
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-muted flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-black/[0.03] border border-border/60 text-[10px] font-mono">⌘ Enter</span>
              {language === 'zh' ? '添加 · Esc 关闭' : 'to add · Esc to close'}
            </span>
            <button
              type="button"
              aria-label={language === 'zh' ? '关闭任务输入' : 'Close task input'}
              onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
              className="text-text-muted hover:text-text-heading hover:bg-black/[0.03] p-1.5 rounded-lg transition-colors active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {showBrainDump && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="floating-card p-6 overflow-hidden border-accent/20"
          >
             <div className="flex justify-between items-center mb-4">
               <div className="flex items-center gap-2">
                 <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                   <Sparkles className="w-4 h-4 text-accent" />
                 </div>
                 <span className="font-sans text-[13px] font-semibold text-text-heading">{language === 'zh' ? 'AI 脑暴' : 'AI Brain Dump'}</span>
               </div>
               <button onClick={() => setShowBrainDump(false)} className="p-1.5 text-text-muted hover:text-text-heading hover:bg-black/[0.03] rounded-lg transition-colors active:scale-95"><Trash2 className="w-4 h-4" /></button>
             </div>
             <textarea
               autoFocus
               className="w-full bg-background border border-border/60 rounded-xl p-4 text-sm font-sans outline-none focus:border-accent resize-none min-h-[120px] transition-colors"
               placeholder={language === 'zh' ? "在这里写下您的想法。AI 将提取任务，分类，并设置截止日期/项目...（例如 周五给妈妈打电话，并审查第三季度融资幻灯片）" : "Dump your scatterbrained thoughts here. The AI will extract tasks, categorize them, and set deadlines/projects... (e.g. Need to call mom on Friday, also review Q3 deck for Fundraising)"}
               value={brainDumpText}
               onChange={e => setBrainDumpText(e.target.value)}
             />
             <div className="mt-4 flex justify-end">
               <button
                 onClick={processBrainDump}
                 disabled={isProcessingBrainDump || !brainDumpText.trim()}
                 className="bg-accent text-white px-5 py-2 rounded-lg font-sans text-xs font-semibold shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors active:scale-95"
               >
                 {isProcessingBrainDump ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                 <span>{isProcessingBrainDump ? (language === 'zh' ? '处理中...' : 'Processing...') : (language === 'zh' ? '提取任务' : 'Extract Tasks')}</span>
               </button>
             </div>
          </motion.div>
        )}

        <div className="relative floating-card flex flex-col p-3 sm:p-4 focus-within:border-accent/40 focus-within:shadow-md transition-all duration-300 gap-3">
          <div className="flex flex-1 items-start bg-surface rounded-xl p-3 sm:p-4 focus-within:bg-surface-white transition-colors border border-transparent focus-within:border-border/50">
            <div className="text-accent/60 mr-2 sm:mr-3 hidden sm:block mt-1">
              <Plus className="w-5 h-5" />
            </div>
            <textarea
              autoFocus
              aria-label={language === 'zh' ? '任务标题和描述' : 'Task title and description'}
              placeholder={language === 'zh' ? '你要做什么？' : 'What do you need to do?'}
              className="w-full py-1 outline-none font-semibold placeholder:text-text-muted/60 text-text-heading bg-transparent text-[14px] sm:text-[15px] resize-none overflow-hidden block min-h-[24px]"
              value={newTaskTitle}
              rows={1}
              onChange={e => {
                setNewTaskTitle(e.target.value);
                e.target.style.height = 'inherit';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isComposing && !e.nativeEvent.isComposing && newTaskTitle.trim()) {
                  e.preventDefault();
                  document.getElementById('add-task-btn')?.click();
                }
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center w-full gap-2 pb-1 px-1">
              <button
                type="button"
                onClick={() => {
                  const next = !showDetails;
                  setShowDetails(next);
                  if (!next) {
                    setShowRecurrenceMenu(false);
                    setShowBrainDump(false);
                  }
                }}
                aria-expanded={showDetails}
                className={`flex h-[42px] items-center justify-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors ${showDetails ? 'border-accent/20 bg-accent/10 text-accent' : 'border-border/60 bg-surface text-text-muted hover:text-text-heading'}`}
              >
                {language === 'zh' ? '更多选项' : 'More options'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>

              {/* Quick Tag Selection */}
              <div className={`${showDetails ? 'flex' : 'hidden'} flex-1 flex-col gap-2 min-w-[200px]`}>
                <TagInput
                  tags={newTaskTagsList}
                  onChange={setNewTaskTagsList}
                  availableTags={categories}
                  language={language}
                />
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                {/* Deadline Button */}
                <label className={`relative ${showDetails ? 'flex' : 'hidden'} flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 rounded-lg border transition-all h-[42px] cursor-pointer ${newTaskDeadline ? 'bg-accent/10 text-accent border-accent/20 pr-9' : 'bg-surface text-text-muted border-border/60 hover:bg-black/[0.03]'} focus-within:ring-2 ring-accent/20`}>
                  <Calendar className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${newTaskDeadline ? 'opacity-100' : 'opacity-70'}`} />
                  <input
                    type="date"
                    aria-label={language === 'zh' ? '截止日期' : 'Due date'}
                    className={`bg-transparent outline-none border-none text-xs sm:text-[11px]  font-bold cursor-pointer w-full min-w-[70px] sm:min-w-[120px] ${newTaskDeadline ? 'text-stone-600' : 'text-text-muted'}`}
                    value={newTaskDeadline}
                    onChange={e => setNewTaskDeadline(e.target.value)}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker(); } catch(err){}
                    }}
                  />
                  {newTaskDeadline && (
                    <button
                      type="button"
                      aria-label={language === 'zh' ? '清除截止日期' : 'Clear due date'}
                      onClick={(e) => {
                        e.preventDefault();
                        setNewTaskDeadline('');
                      }}
                      className="absolute right-2 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </label>

                {/* Repeat Button */}
                <div className={`relative ${showDetails ? 'block' : 'hidden'}`} ref={recurrenceRef}>
                  <button
                    onClick={() => setShowRecurrenceMenu(!showRecurrenceMenu)}
                    className={`flex items-center justify-center rounded-lg transition-all h-[42px] w-[42px] shrink-0 border active:scale-95 ${recurrence ? 'bg-accent/10 text-accent border-accent/30 shadow-sm' : 'bg-surface hover:bg-black/[0.03] text-text-muted border-border/60'}`}
                    title={language === 'zh' ? '重复任务' : 'Repeat'}
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                  {showRecurrenceMenu && (
                    <div className="absolute bottom-full mb-2 right-0 bg-surface border border-border/80 rounded-xl shadow-md p-3 z-50 w-56 space-y-1.5 l">
                      <p className="text-[11px] font-semibold text-text-muted px-1 mb-1">{language === 'zh' ? '重复频率' : 'Repeat'}</p>
                      <button
                        onClick={() => { setRecurrence({ type: 'daily' }); setShowRecurrenceMenu(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${recurrence?.type === 'daily' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main hover:bg-black/[0.03]'}`}
                      >
                        {language === 'zh' ? '每天' : 'Daily'}
                      </button>
                      <button
                        onClick={() => { setRecurrence({ type: 'weekly', weekdays }); setShowRecurrenceMenu(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${recurrence?.type === 'weekly' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main hover:bg-black/[0.03]'}`}
                      >
                        {language === 'zh' ? '每周' : 'Weekly'}
                      </button>
                      {recurrence?.type === 'weekly' && (
                        <div className="flex gap-1 px-3">
                          {[
                            { d: 0, l: language === 'zh' ? '日' : 'S' },
                            { d: 1, l: language === 'zh' ? '一' : 'M' },
                            { d: 2, l: language === 'zh' ? '二' : 'T' },
                            { d: 3, l: language === 'zh' ? '三' : 'W' },
                            { d: 4, l: language === 'zh' ? '四' : 'T' },
                            { d: 5, l: language === 'zh' ? '五' : 'F' },
                            { d: 6, l: language === 'zh' ? '六' : 'S' },
                          ].map(({ d, l }) => (
                            <button
                              key={d}
                              onClick={() => {
                                const next = weekdays.includes(d) ? weekdays.filter(w => w !== d) : [...weekdays, d];
                                setWeekdays(next);
                                setRecurrence({ type: 'weekly', weekdays: next });
                              }}
                              className={`w-6 h-6 rounded-md text-[10px] font-semibold transition-colors ${weekdays.includes(d) ? 'bg-accent text-white shadow-sm' : 'bg-black/[0.03] text-text-muted hover:bg-black/[0.06]'}`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const today = new Date();
                          setRecurrence({ type: 'monthly', dayOfMonth: today.getDate() });
                          setShowRecurrenceMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${recurrence?.type === 'monthly' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main hover:bg-black/[0.03]'}`}
                      >
                        {language === 'zh' ? '每月' : 'Monthly'}
                      </button>
                      {recurrence && (
                        <button
                          onClick={() => { setRecurrence(null); setShowRecurrenceMenu(false); }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-heading hover:bg-black/[0.03] transition-colors"
                        >
                          {language === 'zh' ? '取消重复' : 'No repeat'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Button */}
                <button
                  onClick={() => setShowBrainDump(!showBrainDump)}
                  className={`${showDetails ? 'flex' : 'hidden'} items-center justify-center rounded-lg transition-all h-[42px] w-[42px] shrink-0 border active:scale-95 ${showBrainDump ? 'bg-accent/10 text-accent border-accent/30 shadow-sm' : 'bg-surface hover:bg-black/[0.03] text-accent border-border/60'}`}
                  title={language === 'zh' ? 'AI 收集箱' : 'AI Brain Dump'}
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                {/* Submit button */}
                <button
                  id="add-task-btn"
                  disabled={!newTaskTitle.trim()}
                  onClick={() => {
                    if (newTaskTitle.trim()) {
                      const titleLines = newTaskTitle.trim().split('\n');
                      const title = titleLines[0].trim();
                      const description = titleLines.slice(1).join('\n').trim() || undefined;

                      const tags = [...newTaskTagsList];
                      if (tagInputValue.trim()) {
                        const newTag = tagInputValue.trim().toLowerCase();
                        if (!tags.includes(newTag)) tags.push(newTag);
                      }
                      if (!tags.some(t => ['work', 'life'].includes(t))) {
                        tags.push(activeContext);
                      }
                      if (recurrence && !tags.includes('recurring')) {
                        tags.push('recurring');
                      }

                      const finalDeadline = newTaskDeadline || undefined;

                      const newTask: Task = {
                        id: `t_${Date.now()}`,
                        title,
                        description,
                        status: 'todo',
                        tags,
                        deadline: finalDeadline,
                        source_date: currentFileDate
                      };
                      // Optimistic UI update
                      setTasks(prev => [...prev, newTask]);
                      // Track which category was just added
                      const newCategory = tags.filter(t => !['work', 'life', 'tasks'].includes(t))[0];
                      if (newCategory && setLastAddedCategory) {
                        setLastAddedCategory(newCategory);
                      }
                      // Create via API
                      tasksApi.create(currentFileDate, newTask).then(() => {
                        // Refresh markdown AND tasks with server-side stable IDs
                        return filesApi.get(currentFileDate);
                      }).then(data => {
                        if (data) {
                          setMarkdown(data.content);
                          setTasks(data.tasks as Task[]);
                          setLastSyncedMD(data.content);
                          setFilesMap(prev => ({ ...prev, [currentFileDate]: data.content }));
                        }
                        if (recurrence) {
                          recurringApi.create({
                            title,
                            description,
                            tags,
                            recurrence,
                          }).catch((e) => {
                            console.error('Failed to create recurring task', e);
                            showToast(
                              language === 'zh' ? '任务已添加，但重复规则保存失败' : 'Task added, but recurrence could not be saved',
                              'error',
                            );
                          });
                        }
                        showToast(language === 'zh' ? '任务已添加' : 'Task added', 'success');
                      }).catch((e) => {
                        console.error(e);
                        setTasks(prev => prev.filter(task => task.id !== newTask.id));
                        setNewTaskTitle([title, description].filter(Boolean).join('\n'));
                        setNewTaskTagsList(newTaskTagsList);
                        setTagInputValue(tagInputValue);
                        setNewTaskDeadline(newTaskDeadline);
                        setRecurrence(recurrence);
                        setShowTaskInput(true);
                        showToast(language === 'zh' ? '添加失败' : 'Failed to add task', 'error');
                      });
                      setNewTaskTitle('');
                      setNewTaskTagsList([]);
                      setTagInputValue('');
                      setNewTaskDeadline('');
                      setRecurrence(null);
                      setShowTaskInput(false);
                    }
                  }}
                  className={`px-4 sm:px-6 h-[42px] w-full sm:w-auto rounded-lg text-[12px] font-sans font-semibold flex items-center justify-center gap-2 transition-all duration-200 shrink-0 active:scale-95 ${
                    newTaskTitle.trim() ? "bg-accent text-white hover:bg-accent/90 shadow-md hover:-translate-y-[1px]" : "bg-surface text-text-muted/50 border border-border/80 cursor-not-allowed"
                  } flex-1 sm:flex-none`}
                >
                  <span>{language === 'zh' ? '添加任务' : 'Add Task'}</span>
                  <CornerUpRight className={`w-4 h-4 ${newTaskTitle.trim() ? 'opacity-80' : 'opacity-0'} hidden sm:block transition-opacity`} />
                </button>
              </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
