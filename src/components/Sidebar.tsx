/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, X, Plus, FileText, Sparkles } from 'lucide-react';
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
      <aside className={`fixed lg:relative inset-y-0 left-0 w-64 flex flex-col shrink-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-700 ${isSidebarOpen ? 'translate-x-0 lg:ml-0 border-r border-border' : '-translate-x-full lg:ml-[-16rem] border-r-0'} bg-surface`}>
        <div className="p-6 w-64 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-accent text-white flex items-center justify-center font-sans text-sm font-bold rounded-md shadow-sm">D</div>
            <span className="font-sans text-base font-semibold text-text-heading">DailyFlow</span>
          </div>

          {workspaceSwitcher && (
            <div className="mb-6">{workspaceSwitcher}</div>
          )}

          <nav className="space-y-6 flex-1 overflow-y-auto">
            {/* Timeline */}
            <div>
              <h3 className="text-xs  text-text-muted font-bold mb-3 flex items-center justify-between">
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
                  className="p-1 rounded-md bg-text-muted/10 text-text-muted hover:bg-accent/10 hover:text-accent transition-colors flex items-center gap-1"
                  title="New Daily Task"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </h3>
              <ul className="space-y-1.5 text-sm font-sans">
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
            <ul className="space-y-1.5 text-sm font-sans">
              <li
                onClick={() => { setActiveTab('notes'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`flex items-center gap-2.5 cursor-pointer px-2 py-1.5 -mx-2 rounded-md transition-all ${activeTab === 'notes' ? 'bg-accent/10 text-accent font-semibold' : 'text-text-muted hover:text-text-heading hover:bg-surface'}`}
                data-testid="nav-notes"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'zh' ? '笔记' : 'Notes'}</span>
              </li>
              <li
                onClick={() => { setActiveTab('ai-chat'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`flex items-center gap-2.5 cursor-pointer px-2 py-1.5 -mx-2 rounded-md transition-all ${activeTab === 'ai-chat' ? 'bg-accent/10 text-accent font-semibold' : 'text-text-muted hover:text-text-heading hover:bg-surface'}`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'zh' ? 'AI 对话' : 'AI Chat'}</span>
              </li>
            </ul>
          </nav>

          {/* Mobile close */}
          <li className="pt-4 mt-auto lg:hidden">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex w-full items-center gap-3 p-3 rounded-md cursor-pointer hover:bg-accent/10 transition-colors text-text-muted justify-center border border-border"
            >
              <X className="w-4 h-4" />
              <span className="text-xs  font-bold">
                {language === 'zh' ? '关闭' : 'Close'}
              </span>
            </button>
          </li>
        </div>
      </aside>
    </>
  );
}
