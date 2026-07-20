/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, Clock3, X, FileText, Settings, Briefcase, Heart, PanelLeftClose } from 'lucide-react';
import { filesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

interface SidebarProps {
  language: 'en' | 'zh';
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  activeTab: 'today' | 'notes' | 'ai-chat' | 'capsules';
  setActiveTab: (tab: 'today' | 'notes' | 'ai-chat' | 'capsules') => void;
  currentFileDate: string;
  setCurrentFileDate: (date: string) => void;
  filesMap: Record<string, string>;
  setFilesMap: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  recentDates: string[];
  archivedMonths: Record<string, string[]>;
  expandedArchiveMonths: Record<string, boolean>;
  toggleArchiveMonth: (month: string) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  workspaceSwitcher?: React.ReactNode;
  activeContext?: 'work' | 'life';
  onContextChange?: (ctx: 'work' | 'life') => void;
  onOpenSettings?: () => void;
}

export function Sidebar({
  language,
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  currentFileDate,
  setCurrentFileDate,
  filesMap,
  setFilesMap,
  recentDates,
  showToast,
  workspaceSwitcher,
  activeContext,
  onContextChange,
  onOpenSettings,
}: SidebarProps) {
  const goToToday = async () => {
    const today = getTodayStr();
    setActiveTab('today');
    setCurrentFileDate(today);
    if (!filesMap[today]) {
      try {
        await filesApi.create(today, '## Tasks\n');
        setFilesMap(prev => ({ ...prev, [today]: '## Tasks\n' }));
      } catch (error) {
        console.error('Failed to create today', error);
        showToast(language === 'zh' ? '创建今天失败' : 'Could not create today', 'error');
      }
    }
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const previousDays = recentDates.filter(date => date !== getTodayStr()).slice(0, 5);

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/15 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:relative inset-y-0 left-0 w-[230px] flex flex-col shrink-0 z-30 transition-all duration-300 ${isSidebarOpen ? 'translate-x-0 lg:ml-0' : '-translate-x-full lg:ml-[-230px]'} bg-[var(--color-surface)] backdrop-blur-2xl border-r border-[var(--color-border)]`}>
        <div className="px-4 py-4 w-[230px] flex flex-col h-full">
          {/* Logo + collapse */}
          <div className="flex items-center gap-2.5 mb-4 px-1">
            <div className="w-7 h-7 bg-gradient-to-br from-accent to-accent-warm text-white flex items-center justify-center text-sm font-bold rounded-xl shadow-sm">D</div>
            <span className="text-[14px] font-semibold text-text-heading tracking-tight flex-1">DailyFlow</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="hidden lg:flex p-1.5 text-text-muted hover:text-text-heading hover:bg-black/5 rounded-lg transition-colors active:scale-95"
              title={language === 'zh' ? '隐藏侧边栏' : 'Hide sidebar'}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {workspaceSwitcher && (
            <div className="mb-3 px-1">{workspaceSwitcher}</div>
          )}

          <nav className="flex-1 overflow-y-auto">
            <ul className="space-y-1 text-[13px]">
              <li>
                <button
                  onClick={goToToday}
                  data-testid="nav-today"
                  data-active={activeTab === 'today' && currentFileDate === getTodayStr()}
                  className={`nav-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left ${
                    activeTab === 'today' && currentFileDate === getTodayStr()
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>{language === 'zh' ? '今天' : 'Today'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActiveTab('notes'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  data-testid="nav-notes"
                  data-active={activeTab === 'notes'}
                  className={`nav-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left ${
                    activeTab === 'notes'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>{language === 'zh' ? '笔记' : 'Notes'}</span>
                </button>
              </li>
            </ul>

            {previousDays.length > 0 && (
              <div className="mt-7">
                <h3 className="flex items-center gap-1.5 px-2 mb-2 text-[10px] uppercase tracking-wider text-text-muted/70 font-semibold">
                  <Clock3 className="w-3 h-3" />
                  {language === 'zh' ? '最近' : 'Recent'}
                </h3>
                <ul className="space-y-0.5">
                  {previousDays.map(date => (
                    <li key={date}>
                      <button
                        onClick={() => {
                          setActiveTab('today');
                          setCurrentFileDate(date);
                          if (window.innerWidth < 1024) setIsSidebarOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] transition-colors ${
                          activeTab === 'today' && currentFileDate === date
                            ? 'bg-black/[0.04] text-text-heading font-medium'
                            : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'
                        }`}
                      >
                        {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                          weekday: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${date}T00:00:00Z`))}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>

          {/* Bottom section: Work/Life toggle + Sync + Settings */}
          <div className="mt-auto pt-3 border-t border-border/60 space-y-3">
            {/* Work/Life toggle — 1.1.6 visual polish: full-width pill
                with stronger active state, distinct accent per side
                so the user knows which context is loaded. */}
            {onContextChange && (
              <div>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {language === 'zh' ? '模式' : 'Mode'}
                  </span>
                  <span className="text-[10px] text-text-muted/70">
                    {activeContext === 'work'
                      ? (language === 'zh' ? '工作中' : 'On the clock')
                      : (language === 'zh' ? '生活里' : 'Off the clock')}
                  </span>
                </div>
                <div
                  role="tablist"
                  aria-label={language === 'zh' ? '上下文' : 'Context'}
                  className="grid grid-cols-2 gap-0.5 p-0.5 bg-black/[0.03] border border-border/50 rounded-lg"
                >
                  <button
                    role="tab"
                    aria-selected={activeContext === 'work'}
                    onClick={() => onContextChange('work')}
                    data-testid="mode-work"
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all active:scale-95 ${
                      activeContext === 'work'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    {language === 'zh' ? '工作' : 'Work'}
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeContext === 'life'}
                    onClick={() => onContextChange('life')}
                    data-testid="mode-life"
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all active:scale-95 ${
                      activeContext === 'life'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    {language === 'zh' ? '生活' : 'Life'}
                  </button>
                </div>
              </div>
            )}

            {/* Settings */}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                data-testid="settings-button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-heading rounded-lg transition-colors hover:bg-black/[0.03] active:scale-[0.99]"
              >
                <Settings className="w-3.5 h-3.5 opacity-70" />
                {language === 'zh' ? '设置' : 'Settings'}
              </button>
            )}
          </div>

          {/* Mobile close */}
          <li className="pt-3 mt-1 lg:hidden list-none">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex w-full items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors text-text-muted justify-center border border-border/50 text-[12px] active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
              {language === 'zh' ? '关闭' : 'Close'}
            </button>
          </li>
        </div>
      </aside>
    </>
  );
}
