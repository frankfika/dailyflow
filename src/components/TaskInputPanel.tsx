/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion } from 'motion/react';
import { X, Plus, Sparkles, Loader2, Calendar, CornerUpRight, Trash2 } from 'lucide-react';
import { getTagColor } from '../utils/tagColors';
import { tasksApi, filesApi } from '../api/client';

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
}: TaskInputPanelProps) {
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
        className="fixed inset-x-0 bottom-0 z-50 p-4 bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-10px_20px_rgba(0,0,0,0.05)] sm:sticky sm:bottom-4 sm:p-0 sm:bg-transparent sm:backdrop-blur-none sm:border-none sm:shadow-none space-y-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">{language === 'zh' ? '按 Esc 关闭' : 'Press Esc to close'}</span>
          <button
            onClick={() => { setShowTaskInput(false); setShowBrainDump(false); }}
            className="text-text-muted hover:text-text-heading p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {showBrainDump && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-surface border border-accent/20 rounded-[24px] p-6 shadow-sm overflow-hidden"
          >
             <div className="flex justify-between items-center mb-4">
               <div className="flex items-center gap-2">
                 <Sparkles className="w-4 h-4 text-accent" />
                 <span className="font-sans text-[10px] uppercase font-bold tracking-widest text-accent">{language === 'zh' ? 'AI 脑暴' : 'AI Brain Dump'}</span>
               </div>
               <button onClick={() => setShowBrainDump(false)} className="text-text-muted hover:text-text-heading"><Trash2 className="w-4 h-4" /></button>
             </div>
             <textarea
               autoFocus
               className="w-full bg-background border border-border/50 rounded-xl p-4 text-sm font-sans outline-none focus:border-accent resize-none min-h-[120px]"
               placeholder={language === 'zh' ? "在这里写下您的想法。AI 将提取任务，分类，并设置截止日期/项目...（例如 周五给妈妈打电话，并审查第三季度融资幻灯片）" : "Dump your scatterbrained thoughts here. The AI will extract tasks, categorize them, and set deadlines/projects... (e.g. Need to call mom on Friday, also review Q3 deck for Fundraising)"}
               value={brainDumpText}
               onChange={e => setBrainDumpText(e.target.value)}
             />
             <div className="mt-4 flex justify-end">
               <button
                 onClick={processBrainDump}
                 disabled={isProcessingBrainDump || !brainDumpText.trim()}
                 className="bg-accent text-white px-6 py-2 rounded-full font-sans text-[10px] font-bold uppercase tracking-widest shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {isProcessingBrainDump ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                 <span>{isProcessingBrainDump ? (language === 'zh' ? '处理中...' : 'Processing...') : (language === 'zh' ? '提取任务' : 'Extract Tasks')}</span>
               </button>
             </div>
          </motion.div>
        )}

        <div className="relative rounded-2xl bg-surface-white flex flex-col p-3 sm:p-4 border border-border focus-within:border-accent/40 focus-within:shadow-md shadow-sm transition-all duration-300 gap-3">
          <div className="flex flex-1 items-start bg-surface/50 rounded-xl p-3 sm:p-4 focus-within:bg-surface-white transition-colors border border-transparent focus-within:border-border/50">
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
              <div className="flex-1 flex flex-col gap-2">
                {/* Selected Tags */}
                {newTaskTagsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {newTaskTagsList.map(tag => (
                      <span key={tag} className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold flex items-center gap-1 group border ${getTagColor(tag)} cursor-default`}>
                        {tag}
                        <X className="w-3 h-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => setNewTaskTagsList(prev => prev.filter(t => t !== tag))} />
                      </span>
                    ))}
                  </div>
                )}

                {/* Available Tags as Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {categories.filter(c => !newTaskTagsList.includes(c)).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (!newTaskTagsList.includes(cat)) {
                          setNewTaskTagsList([...newTaskTagsList, cat]);
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition-all border ${getTagColor(cat)} opacity-60 hover:opacity-100 hover:scale-105 active:scale-95`}
                    >
                      + {cat}
                    </button>
                  ))}

                  {/* Custom Tag Input */}
                  <div className="flex items-center gap-1 bg-surface rounded-lg border border-border/80 focus-within:border-accent px-2 py-1 transition-colors">
                    <input
                      type="text"
                      className="bg-transparent text-[10px] uppercase tracking-widest font-bold outline-none text-text-heading placeholder:text-text-muted/60 w-20"
                      placeholder={language === 'zh' ? '自定义...' : 'Custom...'}
                      value={tagInputValue}
                      onChange={e => setTagInputValue(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInputValue.trim()) {
                          e.preventDefault();
                          const newTag = tagInputValue.trim().toLowerCase();
                          if (!newTaskTagsList.includes(newTag)) {
                            setNewTaskTagsList([...newTaskTagsList, newTag]);
                          }
                          setTagInputValue('');
                        } else if (e.key === 'Enter' && !tagInputValue.trim() && newTaskTitle.trim()) {
                          e.preventDefault();
                          document.getElementById('add-task-btn')?.click();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                {/* Deadline Button */}
                <label className={`flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 rounded-xl border transition-all h-[42px] cursor-pointer ${newTaskDeadline ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-surface text-text-muted border-border/80 hover:bg-surface-white'} focus-within:ring-2 ring-accent/20`}>
                  <Calendar className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${newTaskDeadline ? 'opacity-100' : 'opacity-70'}`} />
                  <input
                    type="date"
                    className={`bg-transparent outline-none border-none text-[10px] sm:text-[11px] uppercase tracking-widest font-bold cursor-pointer w-full min-w-[70px] sm:min-w-[120px] ${newTaskDeadline ? 'text-blue-600' : 'text-text-muted'}`}
                    value={newTaskDeadline}
                    onChange={e => setNewTaskDeadline(e.target.value)}
                    onClick={(e) => {
                      try { (e.target as HTMLInputElement).showPicker(); } catch(err){}
                    }}
                  />
                </label>

                {/* AI Button */}
                <button
                  onClick={() => setShowBrainDump(!showBrainDump)}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-100 flex items-center justify-center rounded-xl transition-colors h-[42px] w-[42px] shrink-0 shadow-sm"
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
                      setNewTaskTitle('');
                      setNewTaskTagsList([]);
                      setTagInputValue('');
                      setNewTaskDeadline('');
                      setShowTaskInput(false);
                    }
                  }}
                  className={`px-4 sm:px-6 h-[42px] w-full sm:w-auto rounded-xl text-[12px] uppercase font-sans tracking-widest font-black flex items-center justify-center gap-2 transition-all duration-200 shrink-0 ${
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
