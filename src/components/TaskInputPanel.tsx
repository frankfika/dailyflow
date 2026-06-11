/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion } from 'motion/react';
import { X, Plus, Sparkles, Loader2, Calendar, CornerUpRight, Trash2, Repeat } from 'lucide-react';
import { useState, useEffect } from 'react';
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
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (!showTaskInput) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTaskInput(false);
        setShowBrainDump(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showTaskInput]);

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
        className="fixed inset-x-0 bottom-0 z-50 p-4 sm:sticky sm:bottom-6 sm:px-8 lg:px-12 space-y-4"
      >
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">{language === 'zh' ? '按 Esc 关闭' : 'Press Esc to close'}</span>
            <button
              onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
              className="text-text-muted hover:text-text-heading p-1"
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
                 <Sparkles className="w-4 h-4 text-accent" />
                 <span className="font-sans text-xs font-bold  text-accent">{language === 'zh' ? 'AI 脑暴' : 'AI Brain Dump'}</span>
               </div>
               <button onClick={() => setShowBrainDump(false)} className="text-text-muted hover:text-text-heading"><Trash2 className="w-4 h-4" /></button>
             </div>
             <textarea
               autoFocus
               className="w-full bg-background border border-border/50 rounded-md p-4 text-sm font-sans outline-none focus:border-accent resize-none min-h-[120px]"
               placeholder={language === 'zh' ? "在这里写下您的想法。AI 将提取任务，分类，并设置截止日期/项目...（例如 周五给妈妈打电话，并审查第三季度融资幻灯片）" : "Dump your scatterbrained thoughts here. The AI will extract tasks, categorize them, and set deadlines/projects... (e.g. Need to call mom on Friday, also review Q3 deck for Fundraising)"}
               value={brainDumpText}
               onChange={e => setBrainDumpText(e.target.value)}
             />
             <div className="mt-4 flex justify-end">
               <button
                 onClick={processBrainDump}
                 disabled={isProcessingBrainDump || !brainDumpText.trim()}
                 className="bg-accent text-white px-6 py-2 rounded font-sans text-xs font-bold  shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {isProcessingBrainDump ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                 <span>{isProcessingBrainDump ? (language === 'zh' ? '处理中...' : 'Processing...') : (language === 'zh' ? '提取任务' : 'Extract Tasks')}</span>
               </button>
             </div>
          </motion.div>
        )}

        <div className="relative floating-card flex flex-col p-3 sm:p-4 focus-within:border-accent/40 focus-within:shadow-md shadow-sm transition-all duration-300 gap-3">
          <div className="flex flex-1 items-start bg-surface/50 rounded-md p-3 sm:p-4 focus-within:bg-surface-white transition-colors border border-transparent focus-within:border-border/50">
            <div className="text-accent/60 mr-2 sm:mr-3 hidden sm:block mt-1">
              <Plus className="w-5 h-5" />
            </div>
            <textarea
              autoFocus
              placeholder={language === 'zh' ? "在此添加新任务，亦可换行添加描述..." : "Add a new task here, use new lines for description..."}
              className="w-full py-1 outline-none font-semibold placeholder:text-text-muted/60 text-text-heading bg-transparent text-[14px] sm:text-[15px] resize-none overflow-hidden block min-h-[24px]"
              value={newTaskTitle}
              rows={1}
              onChange={e => {
                setNewTaskTitle(e.target.value);
                e.target.style.height = 'inherit';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && newTaskTitle.trim()) {
                  e.preventDefault();
                  document.getElementById('add-task-btn')?.click();
                }
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center w-full gap-2 pb-1 px-1">
              {/* Quick Tag Selection */}
              <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
                <TagInput
                  tags={newTaskTagsList}
                  onChange={setNewTaskTagsList}
                  availableTags={categories}
                  language={language}
                />
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                {/* Deadline Button */}
                <label className={`relative flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 rounded-md border transition-all h-[42px] cursor-pointer ${newTaskDeadline ? 'bg-stone-50 text-stone-600 border-stone-200 pr-8' : 'bg-surface text-text-muted border-border/80 hover:bg-surface-white'} focus-within:ring-2 ring-accent/20`}>
                  <Calendar className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${newTaskDeadline ? 'opacity-100' : 'opacity-70'}`} />
                  <input
                    type="date"
                    className={`bg-transparent outline-none border-none text-xs sm:text-[11px]  font-bold cursor-pointer w-full min-w-[70px] sm:min-w-[120px] ${newTaskDeadline ? 'text-stone-600' : 'text-text-muted'}`}
                    value={newTaskDeadline}
                    onChange={e => setNewTaskDeadline(e.target.value)}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker(); } catch(err){}
                    }}
                  />
                  {newTaskDeadline && (
                    <button
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
                <div className="relative">
                  <button
                    onClick={() => setShowRecurrenceMenu(!showRecurrenceMenu)}
                    className={`flex items-center justify-center rounded-md transition-colors h-[42px] w-[42px] shrink-0 shadow-sm border ${recurrence ? 'bg-accent/10 text-accent border-accent/30' : 'bg-surface hover:bg-border/50 text-text-muted border-transparent'}`}
                    title={language === 'zh' ? '重复任务' : 'Repeat'}
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                  {showRecurrenceMenu && (
                    <div className="absolute bottom-full mb-2 right-0 bg-surface-white border border-border rounded-md shadow-md p-3 z-50 w-56 space-y-2">
                      <p className="text-xs font-bold text-text-muted mb-2">{language === 'zh' ? '重复频率' : 'Repeat'}</p>
                      <button
                        onClick={() => { setRecurrence({ type: 'daily' }); setShowRecurrenceMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors ${recurrence?.type === 'daily' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main'}`}
                      >
                        {language === 'zh' ? '每天' : 'Daily'}
                      </button>
                      <button
                        onClick={() => { setRecurrence({ type: 'weekly', weekdays }); setShowRecurrenceMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors ${recurrence?.type === 'weekly' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main'}`}
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
                              className={`w-6 h-6 rounded text-[10px] font-bold ${weekdays.includes(d) ? 'bg-accent text-white' : 'bg-surface text-text-muted'}`}
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
                        className={`w-full text-left px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors ${recurrence?.type === 'monthly' ? 'bg-accent/10 text-accent font-medium' : 'text-text-main'}`}
                      >
                        {language === 'zh' ? '每月' : 'Monthly'}
                      </button>
                      {recurrence && (
                        <button
                          onClick={() => { setRecurrence(null); setShowRecurrenceMenu(false); }}
                          className="w-full text-left px-3 py-1.5 rounded text-xs text-stone-500 hover:bg-stone-50 transition-colors"
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
                  className="bg-surface hover:bg-border/50 text-accent border border-transparent flex items-center justify-center rounded-md transition-colors h-[42px] w-[42px] shrink-0 shadow-sm"
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

                      const finalDeadline = newTaskDeadline || currentFileDate;

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
                        showToast(language === 'zh' ? '任务已添加' : 'Task added', 'success');
                      }).catch((e) => {
                        console.error(e);
                        showToast(language === 'zh' ? '添加失败' : 'Failed to add task', 'error');
                      });
                      // If recurrence is set, also create a recurring task definition
                      if (recurrence) {
                        recurringApi.create({
                          title,
                          description,
                          tags,
                          recurrence,
                        }).catch(e => console.error('Failed to create recurring task', e));
                      }
                      setNewTaskTitle('');
                      setNewTaskTagsList([]);
                      setTagInputValue('');
                      setNewTaskDeadline('');
                      setRecurrence(null);
                      setShowTaskInput(false);
                    }
                  }}
                  className={`px-4 sm:px-6 h-[42px] w-full sm:w-auto rounded-md text-[12px] font-sans  font-black flex items-center justify-center gap-2 transition-all duration-200 shrink-0 ${
                    newTaskTitle.trim() ? "bg-accent text-white hover:bg-accent/90 shadow-md hover:-translate-y-[1px] active:translate-y-0" : "bg-surface-white text-text-muted/50 border border-border/80 cursor-not-allowed"
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
