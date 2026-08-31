import { useState } from 'react';
import { Check, Target } from 'lucide-react';

interface TodayFocusBarProps {
  tasks: Array<{ id: string; title: string; status: 'todo' | 'done' | 'migrated' }>;
  focusTaskIds: string[];
  onChange: (ids: string[]) => void;
  language: 'en' | 'zh';
  isToday: boolean;
}

const MAX_FOCUS = 3;

/**
 * Collapsed focus row (design v3.1 S1): "今天 · 焦点 N/3 · <titles> · 选 3 件 →".
 * Expanding reveals an inline picker over today's open tasks. The "AI 帮我选"
 * action lands in S6 (needs a backend action); until then only manual
 * selection is offered — no dead buttons on the home page.
 */
export function TodayFocusBar({ tasks, focusTaskIds, onChange, language, isToday }: TodayFocusBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!isToday) return null;

  const openTasks = tasks.filter(task => task.status === 'todo');
  if (openTasks.length === 0) return null;

  const titleById = new Map(tasks.map(task => [task.id, task.title] as const));
  const selectedTitles = focusTaskIds
    .map(id => titleById.get(id))
    .filter((title): title is string => Boolean(title));

  const toggleTask = (id: string) => {
    if (focusTaskIds.includes(id)) {
      onChange(focusTaskIds.filter(item => item !== id));
      return;
    }
    if (focusTaskIds.length >= MAX_FOCUS) return;
    onChange([...focusTaskIds, id]);
  };

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  if (!expanded) {
    return (
      <div className="today-focus-bar" data-testid="today-focus-bar">
        <button type="button" className="today-focus-main" onClick={() => setExpanded(true)}>
          <Target className="today-focus-icon" aria-hidden="true" />
          <span className="today-focus-label">{t('今天 · 焦点', 'Today · Focus')}</span>
          <span className="today-focus-count">{focusTaskIds.length}/{MAX_FOCUS}</span>
          <span className="today-focus-preview">
            {selectedTitles.length > 0
              ? selectedTitles.slice(0, 3).join(' · ')
              : t('选 3 件做完才算今天', 'Pick 3 to define the day')}
          </span>
          <span className="today-focus-open">{t('选 3 件 →', 'Pick 3 →')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="today-focus-bar today-focus-bar-expanded" data-testid="today-focus-bar">
      <div className="today-focus-head">
        <Target className="today-focus-icon" aria-hidden="true" />
        <span className="today-focus-label">{t('今天 · 焦点', 'Today · Focus')}</span>
        <span className="today-focus-count">{focusTaskIds.length}/{MAX_FOCUS}</span>
        <span className="today-focus-meta">{t('今天就 3 件，其余自动归入其他任务，明天还能看见。', 'Three items define the day; everything else stays visible tomorrow.')}</span>
        <button type="button" className="today-focus-save" onClick={() => setExpanded(false)}>
          {t('保存', 'Save')}
        </button>
      </div>
      <ul className="today-focus-list">
        {openTasks.map(task => {
          const selectedIndex = focusTaskIds.indexOf(task.id);
          return (
            <li key={task.id}>
              <button
                type="button"
                className={`today-focus-item${selectedIndex >= 0 ? ' is-selected' : ''}${focusTaskIds.length >= MAX_FOCUS && selectedIndex < 0 ? ' is-capped' : ''}`}
                onClick={() => toggleTask(task.id)}
                aria-pressed={selectedIndex >= 0}
              >
                <span className="today-focus-check">
                  {selectedIndex >= 0 ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                </span>
                <span className="today-focus-item-title">{task.title}</span>
                {selectedIndex >= 0 && <span className="today-focus-order">{selectedIndex + 1}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
