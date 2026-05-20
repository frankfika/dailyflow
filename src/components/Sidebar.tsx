/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, ChevronRight, X, Plus, Loader2 } from 'lucide-react';
import { filesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

interface SidebarProps {
  language: 'en' | 'zh';
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  activeTab: 'today' | 'notes' | 'tags';
  setActiveTab: (tab: 'today' | 'notes' | 'tags') => void;
  currentFileDate: string;
  setCurrentFileDate: (date: string) => void;
  filesMap: Record<string, string>;
  setFilesMap: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  recentDates: string[];
  archivedMonths: Record<string, string[]>;
  expandedArchiveMonths: Record<string, boolean>;
  toggleArchiveMonth: (month: string) => void;
  categories: string[];
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  githubConnected: boolean;
  hasChanges: boolean;
  githubRepo: string | null;
  isSyncing: boolean;
  handleGitSync: () => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  setShowSettings: (v: boolean) => void;
  setConfigTab: (tab: 'general' | 'ai' | 'github') => void;
  githubToken: string;
  verifyGithubConnection: (repoUrl: string, token: string) => Promise<boolean>;
  setGithubConnected: (v: boolean) => void;
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
  categories,
  selectedCategory,
  setSelectedCategory,
  githubConnected,
  hasChanges,
  githubRepo,
  isSyncing,
  handleGitSync,
  showToast,
  setShowSettings,
  setConfigTab,
  githubToken,
  verifyGithubConnection,
  setGithubConnected,
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
        <div className="p-8 w-64">
          <div className="flex flex-col gap-1 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent text-white flex items-center justify-center font-serif text-lg font-bold rounded-lg shadow-sm">D</div>
              <span className="font-sans text-xs uppercase tracking-widest font-bold text-text-heading">DailyFlow</span>
            </div>
            <div className="mt-2 pl-11 text-[10px] uppercase tracking-widest font-bold text-text-muted opacity-80">
              {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-05-04T00:00:00Z'))}
            </div>
          </div>

          <nav className="space-y-8 pb-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4 flex items-center justify-between">
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
                  title="New Daily Note"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </h3>
              <ul className="space-y-3 text-sm font-sans">
                {recentDates.map(date => {
                  const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                  return (
                    <li
                      key={date}
                      onClick={() => setCurrentFileDate(date)}
                      className={`flex items-center gap-3 font-semibold cursor-pointer transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                    >
                      {currentFileDate === date && <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>}
                      <span className={currentFileDate !== date ? "ml-4" : ""}>
                        {date}
                        <span className="ml-1.5 text-[10px] opacity-50 font-normal">{weekday}</span>
                      </span>
                    </li>
                  );
                })}

                {Object.keys(archivedMonths).length > 0 && (
                  <li className="pt-2">
                    <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-3">{language === 'zh' ? '归档' : 'Archive'}</span>
                    <ul className="space-y-2">
                      {Object.keys(archivedMonths).map(monthName => (
                        <li key={monthName} className="space-y-2">
                          <button
                            onClick={() => toggleArchiveMonth(monthName)}
                            className="flex items-center gap-2 text-xs font-bold text-text-muted opacity-80 hover:opacity-100 transition-opacity w-full text-left"
                          >
                            {expandedArchiveMonths[monthName] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span className="ml-[2px]">{monthName}</span>
                          </button>
                          {expandedArchiveMonths[monthName] && (
                            <ul className="space-y-3 pl-4 border-l border-border/50 ml-6 pb-2">
                              {archivedMonths[monthName].map(date => {
                                const weekday = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
                                return (
                                  <li
                                    key={date}
                                    onClick={() => setCurrentFileDate(date)}
                                    className={`flex items-center gap-3 font-semibold cursor-pointer text-xs transition-opacity ${currentFileDate === date ? 'text-accent opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                                  >
                                    {currentFileDate === date && <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>}
                                    <span className={currentFileDate !== date ? "" : ""}>
                                      {date}
                                      <span className="ml-1.5 text-[10px] opacity-50 font-normal">{weekday}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4">{language === 'zh' ? '工作区' : 'Workspace'}</h3>
              <ul className="space-y-3 text-sm font-sans">
                <li
                  onClick={() => { setActiveTab('today'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 cursor-pointer transition-opacity ${activeTab === 'today' ? 'text-text-heading font-semibold opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                  data-testid="nav-daily-notes"
                >
                  <span className="ml-4">{language === 'zh' ? '每日笔记' : 'Daily Notes'}</span>
                </li>
                <li
                  onClick={() => { setActiveTab('notes'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 cursor-pointer transition-opacity ${activeTab === 'notes' ? 'text-text-heading font-semibold opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                  data-testid="nav-notes"
                >
                  <span className="ml-4">{language === 'zh' ? '笔记' : 'Notes'}</span>
                </li>
                <li
                  onClick={() => { setActiveTab('tags'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 cursor-pointer transition-opacity ${activeTab === 'tags' ? 'text-text-heading font-semibold opacity-100' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                  data-testid="nav-tags"
                >
                  <span className="ml-4">{language === 'zh' ? '标签' : 'Tags'}</span>
                </li>
              </ul>
            </div>

            {categories.length > 0 && (
              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-4">{language === 'zh' ? '分类' : 'Categories'}</h3>
                <ul className="space-y-3 text-sm font-sans">
                  {categories.map(c => (
                    <li
                       key={c}
                       onClick={() => {
                         setActiveTab('today');
                         setSelectedCategory(selectedCategory === c ? null : c);
                         if (window.innerWidth < 1024) setIsSidebarOpen(false);
                       }}
                       className={`flex items-center gap-3 cursor-pointer transition-colors ${selectedCategory === c ? 'text-accent font-semibold' : 'text-text-muted opacity-60 hover:opacity-100'}`}
                    >
                      <div className={`ml-4 w-3 h-3 rounded-sm flex-shrink-0 border flex items-center justify-center transition-colors ${selectedCategory === c ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                         {selectedCategory === c && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                      </div>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
          <li
            className="pt-2 mt-auto lg:hidden"
          >
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex w-full items-center gap-3 p-3 mt-4 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors text-text-muted justify-center border border-border"
            >
              <X className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                {language === 'zh' ? '关闭' : 'Close'}
              </span>
            </button>
          </li>
        </div>

        <div className="mt-auto p-8 border-t border-border flex flex-col gap-4">
          <div>
            <span className="text-[10px] uppercase font-sans tracking-widest font-bold text-text-muted opacity-60">{language === 'zh' ? '版本控制' : 'Version Control'}</span>

            {!githubConnected ? (
              /* GitHub 未配置或未验证通过时显示引导 */
              <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/20">
                <p className="text-[10px] text-text-muted leading-relaxed mb-2">
                  {language === 'zh'
                    ? (githubRepo ? '⚠️ GitHub 连接失败，请检查配置。' : '配置 GitHub 仓库，自动备份你的笔记。')
                    : (githubRepo ? '⚠️ GitHub connection failed. Check your settings.' : 'Connect a GitHub repo to back up your notes automatically.')}
                </p>
                <button
                  onClick={async () => {
                    // If we have credentials, try verifying first — don't redirect if it actually works
                    if (githubRepo && githubToken) {
                      const ok = await verifyGithubConnection(githubRepo, githubToken);
                      if (ok) {
                        setGithubConnected(true);
                        return;
                      }
                    }
                    setShowSettings(true);
                    setConfigTab('github');
                  }}
                  className="w-full py-1.5 rounded-lg bg-accent text-white text-[10px] uppercase tracking-widest font-bold hover:bg-accent/90 transition-colors"
                >
                  {language === 'zh' ? '→ 前往配置' : '→ Configure GitHub'}
                </button>
              </div>
            ) : (
              /* 已验证通过时显示同步状态 */
              <>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${hasChanges ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`}></div>
                    <span className="text-xs font-medium text-text-main pr-1">
                      {hasChanges
                        ? (language === 'zh' ? '未提交的更改' : 'Uncommitted changes')
                        : (language === 'zh' ? '已是最新' : 'Up to date')}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted mt-1 truncate opacity-60" title={githubRepo || ''}>
                  {(githubRepo || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')}
                </p>
              </>
            )}
          </div>

          {githubConnected && (
            <button
              onClick={handleGitSync}
              disabled={isSyncing || !hasChanges}
              className={`w-full py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${
                isSyncing
                  ? 'bg-accent text-white border border-accent scale-[0.97]'
                  : 'bg-surface-white border border-border text-text-main hover:border-accent hover:text-accent active:scale-95 disabled:opacity-50'
              }`}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'zh' ? '正在同步...' : 'Syncing...'}</span>
                </>
              ) : (
                <span>{language === 'zh' ? '提交到 GitHub' : 'Commit to GitHub'}</span>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
