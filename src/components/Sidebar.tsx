/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, X, Plus, FileText, Sparkles, Settings, Briefcase, Heart, Loader2 } from 'lucide-react';
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
            className="fixed inset-0 bg-black/20 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:relative inset-y-0 left-0 w-[230px] flex flex-col shrink-0 z-30 transition-all duration-300 ${isSidebarOpen ? 'translate-x-0 lg:ml-0 border-r border-border/60' : '-translate-x-full lg:ml-[-230px] border-r-0'} bg-surface/85 backdrop-blur-xl`}>
        <div className="px-4 py-4 w-[230px] flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-6 h-6 bg-accent text-white flex items-center justify-center text-xs font-bold rounded-lg shadow-sm">D</div>
            <span className="text-[13px] font-semibold text-text-heading tracking-tight">DailyFlow</span>
          </div>

          {workspaceSwitcher && (
            <div className="mb-3 px-1">{workspaceSwitcher}</div>
          )}

          <nav className="space-y-4 flex-1 overflow-y-auto">
            {/* Timeline */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5 px-1 flex items-center justify-between">
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
                  className="p-0.5 rounded text-text-muted hover:text-accent transition-colors"
                  title="New Daily Task"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </h3>
              <ul className="space-y-0.5 text-[12px]">
                {recentDates.map(date => {
                  const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                  return (
                    <li
                      key={date}
                      onClick={() => { setActiveTab('today'); setCurrentFileDate(date); }}
                      className={`flex items-center gap-3 font-semibold cursor-pointer transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                    >
                      {currentFileDate === date && <div className="w-1.5 h-1.5 rounded bg-accent"></div>}
                      <span className={currentFileDate !== date ? "ml-4" : ""}>
                        {date}
                        <span className="ml-1.5 text-xs opacity-50 font-normal">{weekday}</span>
                      </span>
                    </li>
                  );
                })}

              </ul>

              {/* Archive — nested under Timeline */}
              {Object.keys(archivedMonths).length > 0 && (
                <div className="mt-4 pl-3 border-l border-border/40">
                  <h4 className="text-[11px] text-text-muted font-semibold uppercase tracking-wide mb-2 opacity-70">{language === 'zh' ? '归档' : 'Archive'}</h4>
                  <ul className="space-y-1.5 font-sans">
                    {Object.keys(archivedMonths).map(monthName => (
                      <li key={monthName} className="space-y-1.5">
                        <button
                          onClick={() => toggleArchiveMonth(monthName)}
                          className="flex items-center gap-2 text-xs font-bold text-text-muted opacity-80 hover:opacity-100 transition-opacity w-full text-left"
                        >
                          {expandedArchiveMonths[monthName] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span className="ml-[2px]">{monthName}</span>
                        </button>
                        {expandedArchiveMonths[monthName] && (
                          <ul className="space-y-1.5 pl-4 border-l border-border/50 ml-3 pb-1">
                            {archivedMonths[monthName].map(date => {
                              const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                              return (
                                <li
                                  key={date}
                                  onClick={() => { setActiveTab('today'); setCurrentFileDate(date); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                                  className={`flex items-center gap-3 font-semibold cursor-pointer text-xs transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                                >
                                  {currentFileDate === date && <div className="w-1.5 h-1.5 rounded bg-accent"></div>}
                                  <span>
                                    {date}
                                    <span className="ml-1.5 text-xs opacity-50 font-normal">{weekday}</span>
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

            {/* Notes & AI Chat — top-level navigation */}
            <ul className="space-y-0.5 text-[12px]">
              <li
                onClick={() => { setActiveTab('notes'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`group flex items-center gap-2 cursor-pointer px-2 py-1 rounded-md transition-all ${activeTab === 'notes' ? 'text-text-heading font-semibold' : 'text-text-muted hover:text-text-heading hover:bg-black/5'}`}
                data-testid="nav-notes"
              >
                <FileText className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeTab === 'notes' ? 'text-accent opacity-100' : 'opacity-70 group-hover:opacity-100'}`} />
                <span>{language === 'zh' ? '笔记' : 'Notes'}</span>
              </li>
              <li
                onClick={() => { setActiveTab('ai-chat'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`group flex items-center gap-2 cursor-pointer px-2 py-1 rounded-md transition-all ${activeTab === 'ai-chat' ? 'text-text-heading font-semibold' : 'text-text-muted hover:text-text-heading hover:bg-black/5'}`}
              >
                <Sparkles className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeTab === 'ai-chat' ? 'text-accent opacity-100' : 'opacity-70 group-hover:opacity-100'}`} />
                <span>{language === 'zh' ? 'AI 对话' : 'AI Chat'}</span>
              </li>
            </ul>
          </nav>

          {/* Bottom section: Work/Life toggle + Sync + Settings */}
          <div className="mt-auto pt-3 border-t border-border/60 space-y-3">
            {/* Work/Life toggle */}
            {onContextChange && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-text-muted">
                  {language === 'zh' ? '模式' : 'Mode'}
                </span>
                <div className="flex bg-surface rounded-md p-0.5 border border-border">
                  <button
                    onClick={() => onContextChange('work')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all ${
                      activeContext === 'work'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                    {language === 'zh' ? '工作' : 'Work'}
                  </button>
                  <button
                    onClick={() => onContextChange('life')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all ${
                      activeContext === 'life'
                        ? 'bg-accent text-white shadow-sm'
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
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={language === 'zh' ? '同步到 GitHub' : 'Sync to GitHub'}
                >
                  <div className="flex items-center gap-2">
                    {isSyncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                    ) : hasChanges ? (
                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-green-400" />
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
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-heading rounded-md transition-colors hover:bg-black/5"
              >
                <Settings className="w-3.5 h-3.5 opacity-70" />
                {language === 'zh' ? '设置' : 'Settings'}
              </button>
            )}
          </div>

          {/* Mobile close */}
          <li className="pt-3 mt-1 lg:hidden">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex w-full items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-black/5 transition-colors text-text-muted justify-center border border-border/60 text-[12px]"
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
