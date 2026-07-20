import { AnimatePresence, motion } from 'motion/react';
import { Bot, Check, ChevronDown, Loader2, Plus, RotateCcw, Sparkles, Target, WandSparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';

type FocusTask = {
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  source_date?: string;
};

interface DailyFocusProps {
  tasks: FocusTask[];
  focusTaskIds: string[];
  onFocusTaskIdsChange: (ids: string[]) => void;
  onToggleTask: (id: string) => void;
  onAddTask: () => void;
  language: 'en' | 'zh';
  isToday: boolean;
  aiAvailable: boolean;
  onGenerateAIPlan: (brief: string) => Promise<{ taskIds: string[]; summary: string }>;
  onConfigureAI: () => void;
}

export function DailyFocus({
  tasks,
  focusTaskIds,
  onFocusTaskIdsChange,
  onToggleTask,
  onAddTask,
  language,
  isToday,
  aiAvailable,
  onGenerateAIPlan,
  onConfigureAI,
}: DailyFocusProps) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [plannerMode, setPlannerMode] = useState<'ai' | 'manual'>('ai');
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [dailyBrief, setDailyBrief] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiError, setAiError] = useState('');
  const focusTasks = focusTaskIds
    .map(id => tasks.find(task => task.id === id))
    .filter((task): task is FocusTask => Boolean(task));
  const completedCount = focusTasks.filter(task => task.status === 'done').length;
  const progress = focusTasks.length > 0 ? Math.round((completedCount / focusTasks.length) * 100) : 0;

  const candidates = useMemo(() => {
    const selected = new Set(focusTaskIds);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 86_400_000;
    const score = (task: FocusTask) => {
      const priorityScore = task.priority === 'high' ? 100 : task.priority === 'medium' ? 45 : 0;
      let deadlineScore = 10;
      if (task.deadline) {
        const due = new Date(`${task.deadline}T00:00:00`);
        const days = Math.round((due.getTime() - today.getTime()) / dayMs);
        deadlineScore = days >= 0 ? Math.max(25, 60 - days) : Math.max(0, 20 + days);
      }
      let recencyScore = 0;
      if (task.source_date) {
        const source = new Date(`${task.source_date}T00:00:00`);
        const age = Math.max(0, Math.round((today.getTime() - source.getTime()) / dayMs));
        recencyScore = Math.max(0, 20 - age);
      }
      return priorityScore + deadlineScore + recencyScore;
    };
    return tasks
      .filter(task => task.status !== 'done' && task.status !== 'migrated' && !selected.has(task.id))
      .sort((a, b) => score(b) - score(a));
  }, [tasks, focusTaskIds]);
  const visibleCandidates = showAllCandidates ? candidates : candidates.slice(0, 8);

  const addFocusTask = (id: string) => {
    if (focusTasks.length >= 3) return;
    onFocusTaskIdsChange([...focusTasks.map(task => task.id), id]);
  };

  const openPlanner = (mode: 'ai' | 'manual') => {
    // Defensive: if AI isn't configured, fall back to manual mode in-place
    // so the user can still pick their 3 focus tasks without being kicked
    // out of Today into a chat tab that doesn't help them plan.
    const resolved = !aiAvailable && mode === 'ai' ? 'manual' : mode;
    setPlannerMode(resolved);
    setShowAllCandidates(false);
    setAiError('');
    setIsPlanning(true);
  };

  const generatePlan = async () => {
    if (!aiAvailable) {
      // Belt-and-suspenders: if generatePlan is ever invoked without AI,
      // stay in the modal and switch to manual mode rather than jumping
      // to the AI Chat tab via onConfigureAI.
      setPlannerMode('manual');
      return;
    }
    setIsGenerating(true);
    setAiError('');
    try {
      const plan = await onGenerateAIPlan(dailyBrief.trim());
      const validIds = plan.taskIds.filter(id => tasks.some(task => task.id === id)).slice(0, 3);
      if (validIds.length === 0) throw new Error('No valid tasks returned');
      onFocusTaskIdsChange(validIds);
      setAiSummary(plan.summary);
      setIsPlanning(false);
    } catch (error) {
      console.error('AI daily planning failed', error);
      setAiError(language === 'zh' ? 'AI 没有成功生成计划。你可以重试，或改为自己选择。' : 'AI could not build the plan. Try again or choose manually.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copy = {
    eyebrow: language === 'zh' ? '今日承诺' : 'TODAY’S COMMITMENT',
    title: language === 'zh' ? '今天，什么才算真正完成？' : 'What would make today count?',
    subtitle: language === 'zh'
      ? '从所有待办里只选三件。不是都做，是做对。'
      : 'Choose only three from everything on your plate. Do less, deliberately.',
    plan: language === 'zh' ? '让 AI 规划今天' : 'Plan my day with AI',
    manual: language === 'zh' ? '我自己选' : 'Choose myself',
    empty: language === 'zh' ? '还没有可选任务，先记下一件事' : 'No tasks to choose from yet',
    add: language === 'zh' ? '记下一件事' : 'Capture a task',
    edit: language === 'zh' ? '调整' : 'Adjust',
    done: language === 'zh' ? '今天已经收住了。' : 'You closed the loop today.',
    doneSub: language === 'zh' ? '剩下的可以安心留给明天。' : 'Everything else can wait without guilt.',
    choose: language === 'zh' ? '选择最值得推进的任务' : 'Choose what deserves your attention',
    chooseSub: language === 'zh' ? '最多 3 件。优先级和截止时间靠前的已排在上面。' : 'Up to 3. Urgent and high-priority work is surfaced first.',
  };

  return (
    <section className="daily-focus-card" data-testid="daily-focus">
      <div className="daily-focus-heading">
        <div className="daily-focus-mark">
          <Target className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="daily-focus-eyebrow">{copy.eyebrow}</p>
          <h2 className="daily-focus-title">{copy.title}</h2>
          <p className="daily-focus-subtitle">{copy.subtitle}</p>
        </div>
        {focusTasks.length > 0 && (
          <div className="daily-focus-progress" aria-label={`${progress}%`}>
            <span>{completedCount}/{focusTasks.length}</span>
            <div className="daily-focus-progress-track">
              <motion.div
                className="daily-focus-progress-value"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35 }}
              />
            </div>
          </div>
        )}
      </div>

      {focusTasks.length === 0 ? (
        <div className="daily-focus-empty">
          <button
            onClick={() => {
              candidates.length > 0 ? openPlanner(aiAvailable ? 'ai' : 'manual') : onAddTask();
            }}
            className="daily-focus-primary"
            disabled={!isToday}
          >
            <WandSparkles className="w-4 h-4" />
            {candidates.length > 0
              ? (aiAvailable ? copy.plan : copy.manual)
              : copy.add}
          </button>
          {candidates.length > 0 && isToday && aiAvailable && (
            <button onClick={() => openPlanner('manual')} className="daily-focus-manual">
              {copy.manual}
            </button>
          )}
          {!isToday && (
            <span className="text-[11px] text-text-muted">
              {language === 'zh' ? '历史日期仅供回顾' : 'Past days are read-only plans'}
            </span>
          )}
        </div>
      ) : (
        <div className="daily-focus-list">
          {focusTasks.map((task, index) => (
            <motion.div
              key={task.id}
              layout
              className={`daily-focus-row ${task.status === 'done' ? 'is-done' : ''}`}
            >
              <button
                className="daily-focus-check"
                onClick={() => onToggleTask(task.id)}
                aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
              >
                {task.status === 'done' ? <Check className="w-3.5 h-3.5" /> : <span>{index + 1}</span>}
              </button>
              <span className="daily-focus-task-title">{task.title}</span>
              {task.deadline && <span className="daily-focus-meta">{task.deadline}</span>}
              {isToday && (
                <button
                  className="daily-focus-remove"
                  onClick={() => onFocusTaskIdsChange(focusTaskIds.filter(id => id !== task.id))}
                  title={language === 'zh' ? '移出今日三件事' : 'Remove from today’s three'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          ))}

          <div className="daily-focus-footer">
            {completedCount === focusTasks.length ? (
              <div className="daily-focus-complete">
                <Check className="w-4 h-4" />
                <span><strong>{copy.done}</strong> {copy.doneSub}</span>
              </div>
            ) : (
              <span>
                {language === 'zh'
                  ? `还剩 ${focusTasks.length - completedCount} 件，先推进第一件。`
                  : `${focusTasks.length - completedCount} left. Start with the first unfinished item.`}
              </span>
            )}
            {isToday && (
              <button onClick={() => openPlanner(aiAvailable ? 'ai' : 'manual')} className="daily-focus-adjust">
                <RotateCcw className="w-3 h-3" />
                {aiAvailable ? (language === 'zh' ? '告诉 AI 新情况' : 'Re-plan with AI') : copy.edit}
              </button>
            )}
          </div>
          {aiSummary && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="daily-focus-ai-summary"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <p><strong>{language === 'zh' ? 'AI 的取舍：' : 'Why this plan: '}</strong>{aiSummary}</p>
            </motion.div>
          )}
        </div>
      )}

      <AnimatePresence>
        {isPlanning && (
          <>
            <motion.button
              aria-label="Close planner"
              className="fixed inset-0 z-[69] bg-black/20 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPlanning(false)}
            />
            <motion.div
              className="daily-focus-picker"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
            >
              <div className="daily-focus-picker-header">
                <div>
                  <h3>{plannerMode === 'ai' ? (language === 'zh' ? '和 AI 一起决定今天' : 'Shape today with AI') : copy.choose}</h3>
                  <p>
                    {plannerMode === 'ai'
                      ? (language === 'zh' ? `AI 已读过 ${candidates.length + focusTasks.length} 项待办，只需要告诉它今天的现实限制。` : `AI has read ${candidates.length + focusTasks.length} open tasks. Tell it what is different about today.`)
                      : copy.chooseSub}
                  </p>
                </div>
                <button onClick={() => setIsPlanning(false)}><X className="w-4 h-4" /></button>
              </div>

              {plannerMode === 'ai' ? (
                <div className="daily-ai-planner">
                  <div className="daily-ai-message">
                    <div className="daily-ai-avatar"><Bot className="w-4 h-4" /></div>
                    <p>
                      {language === 'zh'
                        ? '我会结合优先级、截止日期和积压时间做取舍。今天有什么会议、精力或必须完成的事情？'
                        : 'I’ll weigh priority, deadlines, and stale work. What should I know about your time, energy, or non-negotiables today?'}
                    </p>
                  </div>
                  <div className="daily-ai-chips">
                    {[
                      language === 'zh' ? '只有 2 小时' : 'Only 2 hours',
                      language === 'zh' ? '低精力模式' : 'Low energy',
                      language === 'zh' ? '今天要出成果' : 'Need a visible win',
                    ].map(chip => (
                      <button
                        key={chip}
                        onClick={() => setDailyBrief(current => current ? `${current}；${chip}` : chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={dailyBrief}
                    onChange={event => setDailyBrief(event.target.value)}
                    placeholder={language === 'zh' ? '例如：上午全是会，下午只有两小时；融资材料今天必须推进。' : 'e.g. Meetings all morning, only two hours after lunch, fundraising must move.'}
                    rows={3}
                    autoFocus
                  />
                  {aiError && <p className="daily-ai-error">{aiError}</p>}
                  <div className="daily-ai-actions">
                    <button onClick={() => setPlannerMode('manual')} data-testid="switch-to-manual" className="daily-ai-secondary">
                      {copy.manual}
                    </button>
                    <button onClick={generatePlan} disabled={isGenerating} className="daily-ai-generate">
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isGenerating
                        ? (language === 'zh' ? '正在权衡...' : 'Weighing tradeoffs...')
                        : (language === 'zh' ? '生成今日计划' : 'Build my day')}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="daily-focus-picker-list">
                {focusTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => onFocusTaskIdsChange(focusTaskIds.filter(id => id !== task.id))}
                    className="daily-focus-picker-row is-selected"
                  >
                    <Check className="w-4 h-4" />
                    <span>{task.title}</span>
                    <small>{language === 'zh' ? '已选择' : 'Selected'}</small>
                  </button>
                ))}
                {visibleCandidates.map(task => (
                  <button
                    key={task.id}
                    disabled={focusTasks.length >= 3}
                    onClick={() => addFocusTask(task.id)}
                    className="daily-focus-picker-row"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{task.title}</span>
                    <small>{task.priority === 'high' ? (language === 'zh' ? '高优先' : 'High priority') : task.deadline || ''}</small>
                  </button>
                ))}
                {candidates.length > 8 && (
                  <button
                    onClick={() => setShowAllCandidates(value => !value)}
                    className="daily-focus-picker-more"
                  >
                    {showAllCandidates
                      ? (language === 'zh' ? '收起候选' : 'Show fewer')
                      : (language === 'zh' ? `查看其余 ${candidates.length - 8} 项` : `Show ${candidates.length - 8} more`)}
                  </button>
                )}
                {candidates.length === 0 && focusTasks.length === 0 && (
                  <button onClick={onAddTask} className="daily-focus-picker-empty">
                    <Plus className="w-4 h-4" />
                    {copy.empty}
                  </button>
                )}
              </div>
              )}

              {plannerMode === 'manual' && (
              <div className="daily-focus-picker-footer">
                <span>{focusTasks.length}/3</span>
                <div className="flex items-center gap-2">
                  {aiAvailable && (
                    <button onClick={() => setPlannerMode('ai')} className="!bg-transparent !text-[var(--color-accent)]">
                      <Sparkles className="w-3.5 h-3.5" />
                      {language === 'zh' ? '交给 AI' : 'Ask AI'}
                    </button>
                  )}
                  <button onClick={() => setIsPlanning(false)}>
                  {language === 'zh' ? '开始今天' : 'Start the day'}
                  <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
                  </button>
                </div>
              </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
