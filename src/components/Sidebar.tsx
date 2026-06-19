/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, X, Plus, FileText, Sparkles, Settings, Briefcase, Heart, Loader2, PanelLeftClose } from 'lucide-react';
import { filesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

interface SidebarProps {
  language: 'en' | 'zh';
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  activeTab: 'today' | 'notes' | 'ai-chat';
  setActiveTab: (tab: 'today' | 'notes' | 'ai-chat') => void;
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
  githubConnected?: boolean;
  isSyncing?: boolean;
  hasChanges?: boolean;
  lastSyncTime?: string | null;
  gitLastCommitTime?: string | null;
  formatSyncTime?: (time: string, lang: 'en' | 'zh', now?: number) => string;
  nowTime?: number;
  onGitSync?: () => void;
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
  archivedMonths,
  expandedArchiveMonths,
  toggleArchiveMonth,
  showToast,
  workspaceSwitcher,
  activeContext,
  onContextChange,
  onOpenSettings,
  githubConnected,
  isSyncing,
  hasChanges,
  lastSyncTime,
  gitLastCommitTime,
  formatSyncTime,
  nowTime,
  onGitSync,
}: SidebarProps) {
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

          <nav className="space-y-5 flex-1 overflow-y-auto">
            {/* Timeline */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2 px-1 flex items-center justify-between">
                <span>{language === 'zh' ? '时间轴' : 'Timeline'}</span>
                <button
                  onClick={async () => {
                    const today = getTodayStr();
                    if (filesMap[today]) {
                      setCurrentFileDate(today);
                      showToast(language === 'zh' ? '已是最新一天' : 'Already on latest day', 'info');
                      return;
                    }
                    try {
                      await filesApi.create(today, '## Tasks\n');
                      setFilesMap((prev: Record<string, string>) => ({ ...prev, [today]: '## Tasks\n' }));
                      setCurrentFileDate(today);
                      showToast(language === 'zh' ? '已创建今日日记' : 'Created today\'s note', 'success');
                    } catch (e) {
                      console.error('Failed to create note', e);
                      showToast(language === 'zh' ? '创建失败' : 'Failed to create note', 'error');
                    }
                  }}
                  className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-colors active:scale-95"
                  title="New Daily Task"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </h3>
              <ul className="space-y-0.5 text-[12px]">
                {recentDates.map(date => {
                  const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                  const isActive = currentFileDate === date;
                  return (
                    <li
                      key={date}
                      onClick={() => { setActiveTab('today'); setCurrentFileDate(date); }}
                      className={`nav-item flex items-center gap-2.5 px-2 py-1.5 rounded-lg font-medium cursor-pointer ${
                        isActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'
                      }`}
                    >
                      {isActive && <div className="w-1 h-1 rounded-full bg-accent"></div>}
                      <span className={isActive ? '' : 'ml-2'}>
                        {date}
                        <span className="ml-1.5 text-[11px] opacity-50 font-normal">{weekday}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Archive — nested under Timeline */}
              {Object.keys(archivedMonths).length > 0 && (
                <div className="mt-4 pl-3 border-l border-border/50">
                  <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2 opacity-70 px-1">{language === 'zh' ? '归档' : 'Archive'}</h4>
                  <ul className="space-y-1 font-sans">
                    {Object.keys(archivedMonths).map(monthName => (
                      <li key={monthName} className="space-y-1">
                        <button
                          onClick={() => toggleArchiveMonth(monthName)}
                          className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-heading hover:bg-black/[0.03] transition-colors text-left"
                        >
                          {expandedArchiveMonths[monthName] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>{monthName}</span>
                        </button>
                        {expandedArchiveMonths[monthName] && (
                          <ul className="space-y-0.5 pl-4 border-l border-border/40 ml-3 pb-1">
                            {archivedMonths[monthName].map(date => {
                              const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                              const isActive = currentFileDate === date;
                              return (
                                <li
                                  key={date}
                                  onClick={() => { setActiveTab('today'); setCurrentFileDate(date); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                  className={`nav-item flex items-center gap-2.5 px-2 py-1 rounded-md font-medium cursor-pointer text-[11px] ${
                                    isActive
                                      ? 'bg-accent/10 text-accent'
                                      : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'
                                  }`}
                                >
                                  {isActive && <div className="w-1 h-1 rounded-full bg-accent"></div>}
                                  <span className={isActive ? '' : 'ml-2'}>
                                    {date}
                                    <span className="ml-1.5 opacity-50 font-normal">{weekday}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Notes / AI Chat — top-level navigation */}
            <ul className="space-y-0.5 text-[12px]">
              <li
                onClick={() => { setActiveTab('notes'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`nav-item group flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded-lg transition-all ${activeTab === 'notes' ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'}`}
                data-testid="nav-notes"
                data-active={activeTab === 'notes'}
              >
                <FileText className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeTab === 'notes' ? 'text-accent' : 'opacity-70 group-hover:opacity-100'}`} />
                <span>{language === 'zh' ? '笔记' : 'Notes'}</span>
              </li>
              <li
                onClick={() => { setActiveTab('ai-chat'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`nav-item group flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded-lg transition-all ${activeTab === 'ai-chat' ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'}`}
                data-testid="nav-ai-chat"
                data-active={activeTab === 'ai-chat'}
              >
                <Sparkles className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeTab === 'ai-chat' ? 'text-accent' : 'opacity-70 group-hover:opacity-100'}`} />
                <span>{language === 'zh' ? 'AI 对话' : 'AI Chat'}</span>
              </li>
            </ul>
          </nav>

          {/* Bottom section: Work/Life toggle + Sync + Settings */}
          <div className="mt-auto pt-3 border-t border-border/60 space-y-3">
            {/* Work/Life toggle */}
            {onContextChange && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-muted">
                  {language === 'zh' ? '模式' : 'Mode'}
                </span>
                <div className="flex bg-black/[0.03] rounded-lg p-0.5 border border-border/50">
                  <button
                    onClick={() => onContextChange('work')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all active:scale-95 ${
                      activeContext === 'work'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                    {language === 'zh' ? '工作' : 'Work'}
                  </button>
                  <button
                    onClick={() => onContextChange('life')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all active:scale-95 ${
                      activeContext === 'life'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    <Heart className="w-3 h-3" />
                    {language === 'zh' ? '生活' : 'Life'}
                  </button>
                </div>
              </div>
            )}

            {/* GitHub Sync */}
            {githubConnected && onGitSync && (
              <div className="space-y-1.5">
                <button
                  onClick={onGitSync}
                  disabled={isSyncing || !hasChanges}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium rounded-lg transition-colors hover:bg-black/[0.03] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99]"
                  title={language === 'zh' ? '同步到 GitHub' : 'Sync to GitHub'}
                >
                  <div className="flex items-center gap-2">
                    {isSyncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                    ) : hasChanges ? (
                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                    )}
                    <span className="text-text-muted">
                      {isSyncing
                        ? (language === 'zh' ? '同步中' : 'Syncing')
                        : hasChanges
                        ? (language === 'zh' ? '未提交的更改' : 'Uncommitted changes')
                        : (language === 'zh' ? '已是最新' : 'Up to date')}
                    </span>
                  </div>
                </button>
                {!isSyncing && (lastSyncTime || gitLastCommitTime) && formatSyncTime && (
                  <p className="text-[10px] text-text-muted px-2 opacity-60">
                    {formatSyncTime(lastSyncTime || gitLastCommitTime!, language, nowTime || Date.now())}
                  </p>
                )}
              </div>
            )}

            {/* Settings */}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
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
