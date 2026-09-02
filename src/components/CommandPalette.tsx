import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, FolderOpen, Moon, RefreshCw, Search, Settings, Sparkles, Target, Users } from 'lucide-react';

export type CommandId =
  | 'today'
  | 'reflection'
  | 'rollover'
  | 'calendar'
  | 'memory'
  | 'team'
  | 'settings'
  | 'toggle-context'
  | 'check-updates'
  | 'pick-date'
  | 'switch-workspace';

interface PaletteTask { id: string; title: string; status: string }
interface PaletteNote { id: string; title: string }
interface PaletteEvent { id: string; title: string }
interface PaletteWorkspace { id: string; name: string }

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  tasks: PaletteTask[];
  notes: PaletteNote[];
  events: PaletteEvent[];
  workspaces: PaletteWorkspace[];
  activeWorkspaceId: string | null;
  onSelectTask: (id: string) => void;
  onSelectNote: (id: string) => void;
  onSelectEvent: (id: string) => void;
  onSelectWorkspace: (id: string) => void;
  onCommand: (command: CommandId) => void;
}

interface PaletteItem {
  key: string;
  section: 'search' | 'command';
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  language,
  tasks,
  notes,
  events,
  workspaces,
  activeWorkspaceId,
  onSelectTask,
  onSelectNote,
  onSelectEvent,
  onSelectWorkspace,
  onCommand,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);

    const searchItems: PaletteItem[] = [];
    for (const event of events) {
      if (match(event.title)) {
        searchItems.push({
          key: `event-${event.id}`,
          section: 'search',
          label: event.title,
          hint: t('事件', 'Event'),
          run: () => onSelectEvent(event.id),
        });
      }
    }
    for (const task of tasks) {
      if (task.status !== 'done' && match(task.title)) {
        searchItems.push({
          key: `task-${task.id}`,
          section: 'search',
          label: task.title,
          hint: t('任务', 'Task'),
          run: () => onSelectTask(task.id),
        });
      }
    }
    for (const note of notes) {
      if (match(note.title)) {
        searchItems.push({
          key: `note-${note.id}`,
          section: 'search',
          label: note.title,
          hint: t('笔记', 'Note'),
          run: () => onSelectNote(note.id),
        });
      }
    }

    const commandItems: PaletteItem[] = ([
      { key: 'today', section: 'command', label: t('今日', 'Today'), hint: '⌘1', run: () => onCommand('today') },
      { key: 'reflection', section: 'command', label: t('今日复盘', 'Daily reflection'), hint: '⌘J', run: () => onCommand('reflection') },
      { key: 'rollover', section: 'command', label: t('整理遗留', 'Review leftovers'), hint: '⌘R', run: () => onCommand('rollover') },
      { key: 'calendar', section: 'command', label: t('日历', 'Calendar'), hint: '⌘5', run: () => onCommand('calendar') },
      { key: 'memory', section: 'command', label: t('记忆', 'Memory'), hint: '⌘6', run: () => onCommand('memory') },
      { key: 'team', section: 'command', label: t('团队', 'Team'), hint: '⌘7', run: () => onCommand('team') },
      { key: 'settings', section: 'command', label: t('设置', 'Settings'), hint: '⌘,', run: () => onCommand('settings') },
      { key: 'toggle-context', section: 'command', label: t('切换 Work/Life', 'Toggle Work/Life'), hint: '⌘⇧1', run: () => onCommand('toggle-context') },
      { key: 'check-updates', section: 'command', label: t('检查更新', 'Check for updates'), run: () => onCommand('check-updates') },
      { key: 'pick-date', section: 'command', label: t('历史日期', 'Past dates'), hint: '⌘D', run: () => onCommand('pick-date') },
      { key: 'switch-workspace', section: 'command', label: t('切工作区', 'Switch workspace'), hint: '⌘⇧W', run: () => onCommand('switch-workspace') },
    ] as PaletteItem[]).filter(item => match(item.label));

    for (const workspace of workspaces) {
      const label = `${t('切换到', 'Switch to')} ${workspace.name}`;
      if (match(label) || match(workspace.name)) {
        commandItems.push({
          key: `ws-${workspace.id}`,
          section: 'command',
          label,
          hint: workspace.id === activeWorkspaceId ? t('当前', 'Current') : undefined,
          run: () => onSelectWorkspace(workspace.id),
        });
      }
    }
    return [...searchItems, ...commandItems];
  }, [open, query, events, tasks, notes, workspaces, activeWorkspaceId, language]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  const runItem = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (items.length === 0 ? 0 : (prev + 1) % items.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (items.length === 0 ? 0 : (prev - 1 + items.length) % items.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  };

  const searchItems = items.filter(item => item.section === 'search');
  const commandItems = items.filter(item => item.section === 'command');

  const renderItem = (item: PaletteItem, index: number) => (
    <button
      key={item.key}
      type="button"
      className={`cmdk-item${index === activeIndex ? ' is-active' : ''}`}
      data-index={index}
      data-testid={`cmdk-item-${item.key}`}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => runItem(item)}
    >
      <span className="cmdk-item-label">{item.label}</span>
      {item.hint && <span className="cmdk-item-hint">{item.hint}</span>}
    </button>
  );

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk-panel" data-testid="command-palette" onKeyDown={onKeyDown}>
        <div className="cmdk-inputrow">
          <Search className="cmdk-searchicon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('搜索或输入命令…', 'Search or type a command…')}
            aria-label={t('命令面板搜索', 'Command palette search')}
            autoFocus
          />
        </div>
        <div className="cmdk-list" ref={listRef}>
          {searchItems.length > 0 && (
            <div className="cmdk-section">
              <div className="cmdk-sectiontitle">{t('搜索', 'Search')}</div>
              {searchItems.map((item, i) => renderItem(item, items.indexOf(item)))}
            </div>
          )}
          {commandItems.length > 0 && (
            <div className="cmdk-section">
              <div className="cmdk-sectiontitle">{t('命令', 'Commands')}</div>
              {commandItems.map((item, i) => renderItem(item, items.indexOf(item)))}
            </div>
          )}
          {items.length === 0 && (
            <div className="cmdk-empty">{t('没有匹配项', 'No matches')}</div>
          )}
        </div>
        <div className="cmdk-foot">{t('Esc 关闭 · ↑↓ 选择 · Enter 执行', 'Esc close · ↑↓ select · Enter run')}</div>
      </div>
    </div>
  );
}
