/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays,
  ChevronDown,
  X,
  FileText,
  ListTodo,
  MessageCircle,
  MoreHorizontal,
  Search,
  Settings,
  Briefcase,
  Heart,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { filesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

/**
 * Mobile sidebar UX (audit #11):
 *  - ≤ 640px (mobile):   hidden by default; full 230px overlay with backdrop
 *                        on top, click outside / Esc / nav-click closes
 *  - 641-1024px (tablet): icon-only 60px strip by default; click icon or
 *                        hover expands to 230px overlay.
 *  - > 1024px (desktop): 230px expanded or 60px icon rail when collapsed.
 *                        Primary navigation always remains visible.
 *
 * User toggle on tablet / desktop persists to localStorage so the choice
 * survives a reload. Mobile ignores storage (always closed by design).
 */

const STORAGE_KEY = 'df_sidebar_collapsed';
const MOBILE_MAX = 640;
const TABLET_MAX = 1024;
const COMPACT_WIDTH = 60;
const FULL_WIDTH = 230;

type ViewportMode = 'mobile' | 'tablet' | 'desktop';

function getViewportMode(width: number): ViewportMode {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

function readStoredCollapse(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredCollapse(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    /* localStorage may be unavailable (private mode) — ignore */
  }
}

interface SidebarProps {
  language: 'en' | 'zh';
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  activeTab: 'today' | 'calendar' | 'notes' | 'ai-chat' | 'memory' | 'mindmap';
  setActiveTab: (tab: 'today' | 'calendar' | 'notes' | 'ai-chat' | 'memory' | 'mindmap') => void;
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
  onOpenNotesSurface?: (surface: 'notes' | 'inbox') => void;
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
  onOpenNotesSurface,
}: SidebarProps) {
  // --- Viewport detection ---
  const [viewport, setViewport] = useState<ViewportMode>(() =>
    typeof window === 'undefined' ? 'desktop' : getViewportMode(window.innerWidth)
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const compute = () => setViewport(getViewportMode(window.innerWidth));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // --- Restore user preference once on mount (tablet / desktop) ---
  // App.tsx already seeds isSidebarOpen with a sensible viewport default;
  // this effect applies the user's persisted choice on top of that.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (viewport === 'mobile') return;
    const stored = readStoredCollapse();
    if (stored === null) return;
    restoredRef.current = true;
    // storage records `collapsed` (true = sidebar hidden). isSidebarOpen
    // is the inverse.
    setIsSidebarOpen(!stored);
  }, [viewport, setIsSidebarOpen]);

  // --- Persist user toggles on tablet / desktop ---
  const persistToggle = useCallback(
    (next: boolean) => {
      if (viewport === 'mobile') return;
      writeStoredCollapse(!next);
    },
    [viewport]
  );

  // --- Viewport-aware render targets ---
  const isMobile = viewport === 'mobile';
  const isTablet = viewport === 'tablet';
  const isDesktop = viewport === 'desktop';

  // compact = persistent 60px icon strip on tablet and desktop. Primary
  // navigation must remain discoverable after the expanded sidebar closes.
  const isCompact = !isMobile && !isSidebarOpen;
  // expanded = sidebar showing the full 230px layout. Mobile, tablet with
  // overlay, or desktop in flow.
  const isExpanded = isSidebarOpen;

  // Hover-expand: meaningful whenever the icon rail is compact. Letting motion own the
  // width keeps the click-toggle and hover-expand animations in lockstep.
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const showExpandedWidth = isExpanded || (isCompact && hoverExpanded);

  // --- Esc to close on mobile / tablet overlay ---
  useEffect(() => {
    if (!isExpanded) return;
    if (isDesktop) return; // desktop sidebar lives in flow, no Esc contract
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded, isDesktop, setIsSidebarOpen]);

  // --- Body scroll lock on mobile when overlay is open ---
  useEffect(() => {
    if (!isMobile || !isExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, isExpanded]);

  // --- Actions ---
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
    if (isMobile) {
      setIsSidebarOpen(false);
    } else if (isTablet) {
      // On tablet, collapse back to the icon strip so the user can see
      // the content they just navigated to.
      setIsSidebarOpen(false);
    }
  };

  const handleNavClick = (tab: 'today' | 'calendar' | 'notes' | 'ai-chat' | 'memory' | 'mindmap') => {
    setActiveTab(tab);
    if (isMobile || isTablet) {
      setIsSidebarOpen(false); // collapse on mobile, fall back to 60px on tablet
    }
  };

  const handleCollapse = () => {
    setIsSidebarOpen(false);
    persistToggle(false);
  };

  const handleExpand = () => {
    setIsSidebarOpen(true);
    persistToggle(true);
  };

  const isAdvancedTab = activeTab === 'calendar' || activeTab === 'memory';
  const [showMore, setShowMore] = useState(isAdvancedTab);

  useEffect(() => {
    if (isAdvancedTab) setShowMore(true);
  }, [isAdvancedTab]);

  const handleMoreClick = () => {
    if (isCompact) {
      setShowMore(true);
      handleExpand();
      return;
    }
    setShowMore(value => !value);
  };

  // --- Animation targets ---
  // Mobile: slide from left. Hidden ↔ -100% x-offset.
  // Tablet: width 60 ↔ 230 (icon strip ↔ overlay).
  // Desktop: width 60 ↔ 230 in flow; it never reaches zero.
  const motionInitial = false; // don't replay on every prop change
  const motionTransition = { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const };

  let motionAnimate: { x?: string; width?: number; marginLeft?: string };
  if (isMobile) {
    // Give the overlay an explicit box width before translating it. Without
    // this, percentage translation can be measured against a shrink-to-fit
    // box and leave the tail of labels (for example “WORKSPACE”) visible.
    motionAnimate = { x: isExpanded ? '0%' : '-100%', width: FULL_WIDTH };
  } else if (isTablet) {
    motionAnimate = { width: showExpandedWidth ? FULL_WIDTH : COMPACT_WIDTH };
  } else {
    // desktop: retain the compact rail instead of hiding navigation entirely
    motionAnimate = {
      width: showExpandedWidth ? FULL_WIDTH : COMPACT_WIDTH,
      marginLeft: '0px',
    };
  }

  // aside class: positioning + z-index + colour/border
  // Mobile/tablet: fixed overlay, sits above content. Desktop: in flow, no z-stacking.
  const asideBaseClass = isDesktop
    ? 'relative z-10 shrink-0 overflow-hidden'
    : 'fixed inset-y-0 left-0 z-30';

  // --- Backdrop (mobile + tablet overlay only) ---
  // Backdrop only shows when the sidebar is "stuck" open — the 60px icon
  // strip is unobtrusive, no backdrop needed for hover-preview.
  const showBackdrop = (isMobile || isTablet) && isExpanded;

  return (
    <>
      {/* Backdrop: tap-to-close on mobile/tablet overlays.
          Hidden on desktop (sidebar lives in flow). */}
      <AnimatePresence>
        {showBackdrop && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 z-20 ${
              isMobile ? 'bg-black/30' : 'bg-black/15'
            }`}
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
            data-testid="sidebar-backdrop"
          />
        )}
      </AnimatePresence>

      <motion.aside
        role="navigation"
        aria-label={language === 'zh' ? '主导航' : 'Main navigation'}
        aria-expanded={isExpanded}
        data-viewport={viewport}
        data-state={isCompact ? 'compact' : isExpanded ? 'expanded' : 'hidden'}
        className={`${asideBaseClass} flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)]`}
        initial={motionInitial}
        animate={motionAnimate}
        transition={motionTransition}
        onClick={(e) => {
          // Keep navigation and utility buttons usable in compact mode.
          // Expanding from their bubbled click used to reopen the overlay
          // immediately after navigation and leave the content dimmed.
          const target = e.target as HTMLElement;
          const isInteractive = Boolean(target.closest('button, a, input, select, textarea'));
          if (isCompact && !isInteractive) {
            e.stopPropagation();
            handleExpand();
          }
        }}
      >
        <div
          data-testid="sidebar-inner"
          className="px-2.5 py-4 flex flex-col h-full"
          style={{ width: showExpandedWidth ? FULL_WIDTH : COMPACT_WIDTH }}
        >
          {/* Logo + collapse */}
          <div
            className={`flex items-center mb-4 ${
              isCompact ? 'justify-center' : 'gap-2.5 px-1.5'
            }`}
          >
            {isCompact ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleExpand();
                }}
                className="w-7 h-7 bg-gradient-to-br from-accent to-accent-warm text-white flex items-center justify-center text-sm font-bold rounded-xl shadow-sm shrink-0 transition-transform active:scale-95"
                title={language === 'zh' ? '展开侧边栏' : 'Expand sidebar'}
                aria-label={language === 'zh' ? '展开侧边栏' : 'Expand sidebar'}
                data-testid="sidebar-expand"
              >
                D
              </button>
            ) : (
              <div
                className="w-7 h-7 bg-gradient-to-br from-accent to-accent-warm text-white flex items-center justify-center text-sm font-bold rounded-xl shadow-sm shrink-0"
                aria-hidden="true"
              >
                D
              </div>
            )}
            <AnimatePresence initial={false}>
              {!isCompact && (
                <motion.span
                  key="brand"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-[14px] font-semibold text-text-heading tracking-tight flex-1 overflow-hidden whitespace-nowrap"
                >
                  DailyFlow
                </motion.span>
              )}
            </AnimatePresence>
            {!isCompact && !isMobile && (
              <button
                onClick={handleCollapse}
                className="p-1.5 text-text-muted hover:text-text-heading hover:bg-black/5 rounded-lg transition-colors active:scale-95"
                title={language === 'zh' ? '隐藏侧边栏' : 'Hide sidebar'}
                data-testid="sidebar-collapse"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Workspace switcher — only when expanded (otherwise the
              select element is too cramped to be usable). */}
          {workspaceSwitcher && !isCompact && (
            <div className="mb-3 px-1.5">{workspaceSwitcher}</div>
          )}

          {/* The default path stays intentionally small. Secondary workspaces
              remain available behind one explicit disclosure. */}
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="space-y-1 text-[13px]">
              {([
                { tab: 'today', label: language === 'zh' ? '今天' : 'Today', icon: ListTodo, action: goToToday },
                { tab: 'mindmap', label: language === 'zh' ? '脑图' : 'MindMap', icon: Sparkles, action: () => handleNavClick('mindmap') },
                { tab: 'notes', label: language === 'zh' ? '笔记' : 'Notes', icon: FileText, action: () => onOpenNotesSurface ? onOpenNotesSurface('notes') : handleNavClick('notes') },
                { tab: 'ai-chat', label: language === 'zh' ? '问 AI' : 'Ask AI', icon: MessageCircle, action: () => handleNavClick('ai-chat') },
              ] as const).map(({ tab, label, icon: Icon, action }) => {
                const active = tab === 'today'
                  ? activeTab === 'today' && currentFileDate === getTodayStr()
                  : activeTab === tab;
                return (
                  <li key={tab}>
                    <button
                      onClick={action}
                      data-testid={`nav-${tab}`}
                      data-active={active}
                      className={`nav-item flex w-full items-center rounded-lg text-left transition-colors ${isMobile ? 'min-h-[44px]' : ''} ${isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'} ${active ? 'bg-accent/10 text-accent font-semibold' : 'text-text-main hover:bg-black/[0.03]'}`}
                      title={isCompact ? label : undefined}
                      aria-label={label}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {!isCompact && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
                    </button>
                  </li>
                );
              })}

              <li className="pt-1">
                <button
                  type="button"
                  onClick={handleMoreClick}
                  data-testid="nav-more"
                  aria-expanded={showMore}
                  className={`nav-item flex w-full items-center rounded-lg text-left transition-colors ${isMobile ? 'min-h-[44px]' : ''} ${isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'} ${isAdvancedTab ? 'text-accent' : 'text-text-muted hover:bg-black/[0.03] hover:text-text-main'}`}
                  title={isCompact ? (language === 'zh' ? '更多' : 'More') : undefined}
                  aria-label={language === 'zh' ? '更多' : 'More'}
                >
                  <MoreHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {!isCompact && (
                    <>
                      <span className="flex-1 overflow-hidden whitespace-nowrap">{language === 'zh' ? '更多' : 'More'}</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>
              </li>
            </ul>

            <AnimatePresence initial={false}>
              {!isCompact && showMore && (
                <motion.div
                  key="secondary-navigation"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-1 overflow-hidden pl-2"
                >
                  <ul className="space-y-0.5 border-l border-border/70 pl-2 text-[12px]">
                    {([
                      { tab: 'calendar', label: language === 'zh' ? '日历' : 'Calendar', icon: CalendarDays },
                      { tab: 'memory', label: language === 'zh' ? '记忆' : 'Memory', icon: Search },
                    ] as const).map(({ tab, label, icon: Icon }) => (
                      <li key={tab}>
                        <button
                          onClick={() => handleNavClick(tab)}
                          data-testid={`nav-${tab}`}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${activeTab === tab ? 'bg-accent/10 font-medium text-accent' : 'text-text-muted hover:bg-black/[0.03] hover:text-text-main'}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      </li>
                    ))}
                    {onOpenSettings && (
                      <li>
                        <button
                          onClick={onOpenSettings}
                          data-testid="settings-button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-muted transition-colors hover:bg-black/[0.03] hover:text-text-main"
                        >
                          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                          {language === 'zh' ? '设置' : 'Settings'}
                        </button>
                      </li>
                    )}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </nav>

          {/* Bottom: the Work/Life context switch stays globally reachable. */}
          <AnimatePresence initial={false}>
            {!isCompact && (
              <motion.div
                key="bottom"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-auto pt-3 border-t border-border/60 space-y-3 overflow-hidden"
              >
                {onContextChange && (
                  <div>
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
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${isMobile ? 'min-h-[44px]' : ''} ${
                          activeContext === 'work'
                            ? 'bg-surface text-accent shadow-sm'
                            : 'text-text-muted hover:text-text-heading'
                        }`}
                      >
                        <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
                        {language === 'zh' ? '工作' : 'Work'}
                      </button>
                      <button
                        role="tab"
                        aria-selected={activeContext === 'life'}
                        onClick={() => onContextChange('life')}
                        data-testid="mode-life"
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${isMobile ? 'min-h-[44px]' : ''} ${
                          activeContext === 'life'
                            ? 'bg-surface text-accent shadow-sm'
                            : 'text-text-muted hover:text-text-heading'
                        }`}
                      >
                        <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                        {language === 'zh' ? '生活' : 'Life'}
                      </button>
                    </div>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact: just the work/life dot + settings icon at the bottom */}
          {isCompact && (
            <div className="mt-auto pt-3 border-t border-border/60 flex flex-col items-center gap-1">
              {onContextChange && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onContextChange(activeContext === 'work' ? 'life' : 'work');
                  }}
                  data-testid={`mode-${activeContext}`}
                  aria-label={activeContext === 'work'
                    ? (language === 'zh' ? '当前为工作，切换到生活' : 'Work — switch to Life')
                    : (language === 'zh' ? '当前为生活，切换到工作' : 'Life — switch to Work')}
                  className="rounded-lg bg-accent/10 p-2 text-accent transition-colors hover:bg-accent/15"
                  title={activeContext === 'work' ? (language === 'zh' ? '工作' : 'Work') : (language === 'zh' ? '生活' : 'Life')}
                >
                  {activeContext === 'work'
                    ? <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                    : <Heart className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSettings();
                  }}
                  data-testid="settings-button"
                  aria-label={language === 'zh' ? '设置' : 'Settings'}
                  className="p-2 text-text-muted hover:text-text-heading hover:bg-black/[0.03] rounded-lg transition-colors"
                  title={language === 'zh' ? '设置' : 'Settings'}
                >
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {/* Mobile close (only on mobile when expanded) — also reachable
              via the backdrop tap or the Esc key, but a visible affordance
              is friendlier on touch. */}
          {isMobile && isExpanded && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              data-testid="sidebar-close"
              className="mt-3 flex w-full items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-black/[0.03] transition-colors text-text-muted justify-center border border-border/50 text-[12px] active:scale-95"
              aria-label={language === 'zh' ? '关闭侧边栏' : 'Close sidebar'}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              {language === 'zh' ? '关闭' : 'Close'}
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}
