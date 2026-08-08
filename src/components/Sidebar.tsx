/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays,
  Clock3,
  X,
  FileText,
  ListTodo,
  MessageCircle,
  Search,
  Settings,
  Briefcase,
  Heart,
  PanelLeftClose,
  Network,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filesApi } from '../api/client';
import { getTodayStr } from '../utils/tagColors';

/**
 * Mobile sidebar UX (audit #11):
 *  - ≤ 640px (mobile):   hidden by default; full 230px overlay with backdrop
 *                        on top, click outside / Esc / nav-click closes
 *  - 641-1024px (tablet): icon-only 60px strip by default; click icon or
 *                        hover expands to 230px overlay; Esc / outside-click
 *                        collapses back to 60px (NOT fully hidden, so the
 *                        user always sees the icon strip)
 *  - > 1024px (desktop): 230px in flow; toggle hides via margin-left
 *                        (matches pre-audit behaviour, owned by App.tsx)
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

  // --- Restore user preference once on mount (tablet/desktop only) ---
  // App.tsx already seeds isSidebarOpen with a sensible viewport default;
  // this effect applies the user's persisted choice on top of that.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (viewport === 'mobile') return; // mobile always closed — ignore storage
    const stored = readStoredCollapse();
    if (stored === null) return;
    restoredRef.current = true;
    // storage records `collapsed` (true = sidebar hidden). isSidebarOpen
    // is the inverse.
    setIsSidebarOpen(!stored);
  }, [viewport, setIsSidebarOpen]);

  // --- Persist user toggles on tablet/desktop ---
  const persistToggle = useCallback(
    (next: boolean) => {
      if (viewport === 'mobile') return; // mobile never persists
      writeStoredCollapse(!next);
    },
    [viewport]
  );

  // --- Viewport-aware render targets ---
  const isMobile = viewport === 'mobile';
  const isTablet = viewport === 'tablet';
  const isDesktop = viewport === 'desktop';

  // compact = tablet at rest (60px icon strip). Only when the user has
  // explicitly closed the sidebar on tablet.
  const isCompact = isTablet && !isSidebarOpen;
  // expanded = sidebar showing the full 230px layout. Mobile, tablet with
  // overlay, or desktop in flow.
  const isExpanded = isSidebarOpen;

  // Hover-expand: only meaningful on tablet compact. Letting motion own the
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
      setHoverExpanded(false);
      setIsSidebarOpen(false);
    }
  };

  const handleNavClick = (tab: 'today' | 'calendar' | 'notes' | 'ai-chat' | 'memory' | 'mindmap') => {
    setActiveTab(tab);
    if (isMobile || isTablet) {
      setHoverExpanded(false);
      setIsSidebarOpen(false); // collapse on mobile, fall back to 60px on tablet
    }
  };

  const handleRecentClick = (date: string) => {
    setActiveTab('today');
    setCurrentFileDate(date);
    if (isMobile || isTablet) {
      setHoverExpanded(false);
      setIsSidebarOpen(false);
    }
  };

  const handleCollapse = () => {
    setIsSidebarOpen(false);
    persistToggle(false);
  };

  const previousDays = useMemo(
    () => recentDates.filter(date => date !== getTodayStr()).slice(0, 5),
    [recentDates]
  );

  // --- Animation targets ---
  // Mobile: slide from left. Hidden ↔ -100% x-offset.
  // Tablet: width 60 ↔ 230 (icon strip ↔ overlay).
  // Desktop: in flow, margin-left 0 ↔ -230 (legacy pattern, kept intact).
  const motionInitial = false; // don't replay on every prop change
  const motionTransition = { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as const };

  let motionAnimate: { x?: string; width?: number; marginLeft?: string };
  if (isMobile) {
    motionAnimate = { x: isExpanded ? '0%' : '-100%' };
  } else if (isTablet) {
    motionAnimate = { width: showExpandedWidth ? FULL_WIDTH : COMPACT_WIDTH };
  } else {
    // desktop: 0 width when collapsed so the flex parent reclaims the space
    motionAnimate = {
      width: isExpanded ? FULL_WIDTH : 0,
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
              isMobile ? 'bg-black/30 backdrop-blur-sm' : 'bg-black/15'
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
        onMouseEnter={() => {
          if (isCompact) setHoverExpanded(true);
        }}
        onMouseLeave={() => {
          if (isCompact) setHoverExpanded(false);
        }}
        onFocus={() => {
          if (isCompact) setHoverExpanded(true);
        }}
        onBlur={() => {
          if (isCompact) setHoverExpanded(false);
        }}
        onClick={(e) => {
          // Keep navigation and utility buttons usable in compact mode.
          // Expanding from their bubbled click used to reopen the overlay
          // immediately after navigation and leave the content dimmed.
          const target = e.target as HTMLElement;
          const isInteractive = Boolean(target.closest('button, a, input, select, textarea'));
          if (isCompact && !isInteractive) {
            e.stopPropagation();
            setIsSidebarOpen(true);
          }
        }}
      >
        <div
          className="px-2.5 py-4 flex flex-col h-full"
          style={{ width: isDesktop || showExpandedWidth ? FULL_WIDTH : COMPACT_WIDTH }}
        >
          {/* Logo + collapse */}
          <div
            className={`flex items-center mb-4 ${
              isCompact ? 'justify-center' : 'gap-2.5 px-1.5'
            }`}
          >
            <div
              className="w-7 h-7 bg-gradient-to-br from-accent to-accent-warm text-white flex items-center justify-center text-sm font-bold rounded-xl shadow-sm shrink-0"
              aria-hidden="true"
            >
              D
            </div>
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

          {/* Nav */}
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="space-y-1 text-[13px]">
              <li>
                <button
                  onClick={goToToday}
                  data-testid="nav-today"
                  data-active={activeTab === 'today' && currentFileDate === getTodayStr()}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'today' && currentFileDate === getTodayStr()
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? '今天' : 'Today') : undefined}
                  aria-label={language === 'zh' ? '今天' : 'Today'}
                >
                  <ListTodo className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="today-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? '今天' : 'Today'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavClick('calendar')}
                  data-testid="nav-calendar"
                  data-active={activeTab === 'calendar'}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'calendar'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? '日历' : 'Calendar') : undefined}
                  aria-label={language === 'zh' ? '日历' : 'Calendar'}
                >
                  <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="calendar-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? '日历' : 'Calendar'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenNotesSurface ? onOpenNotesSurface('notes') : handleNavClick('notes')}
                  data-testid="nav-notes"
                  data-active={activeTab === 'notes'}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'notes'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? '笔记' : 'Notes') : undefined}
                  aria-label={language === 'zh' ? '笔记' : 'Notes'}
                >
                  <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="notes-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? '笔记' : 'Notes'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavClick('ai-chat')}
                  data-testid="nav-ai-chat"
                  data-active={activeTab === 'ai-chat'}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'ai-chat'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? 'AI 对话' : 'AI Chat') : undefined}
                  aria-label={language === 'zh' ? 'AI 对话' : 'AI Chat'}
                >
                  <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="ai-chat-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? 'AI 对话' : 'AI Chat'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavClick('memory')}
                  data-testid="nav-memory"
                  data-active={activeTab === 'memory'}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'memory'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? '记忆' : 'Memory') : undefined}
                  aria-label={language === 'zh' ? '记忆' : 'Memory'}
                >
                  <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="memory-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? '记忆' : 'Memory'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavClick('mindmap')}
                  data-testid="nav-mindmap"
                  data-active={activeTab === 'mindmap'}
                  className={`nav-item w-full flex items-center rounded-lg text-left transition-colors ${
                    isCompact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
                  } ${
                    activeTab === 'mindmap'
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-main hover:bg-black/[0.03]'
                  }`}
                  title={isCompact ? (language === 'zh' ? '思维导图' : 'Mind Map') : undefined}
                  aria-label={language === 'zh' ? '思维导图' : 'Mind Map'}
                >
                  <Network className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <AnimatePresence initial={false}>
                    {!isCompact && (
                      <motion.span
                        key="mindmap-label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {language === 'zh' ? '思维导图' : 'Mind Map'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            </ul>

            {/* Recent (expanded only) */}
            <AnimatePresence initial={false}>
              {!isCompact && previousDays.length > 0 && (
                <motion.div
                  key="recent"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-7 overflow-hidden"
                >
                  <h3 className="flex items-center gap-1.5 px-2 mb-2 text-[10px] uppercase tracking-wider text-text-muted/70 font-semibold">
                    <Clock3 className="w-3 h-3" aria-hidden="true" />
                    {language === 'zh' ? '最近' : 'Recent'}
                  </h3>
                  <ul className="space-y-0.5">
                    {previousDays.map(date => (
                      <li key={date}>
                        <button
                          onClick={() => handleRecentClick(date)}
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent marker in compact mode — single icon hints there
                is history, but the full list only renders when expanded. */}
            {isCompact && previousDays.length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-3 flex justify-center">
                <span
                  className="p-1.5 rounded-md text-text-muted/70"
                  title={`${previousDays.length} ${language === 'zh' ? '最近' : 'recent'}`}
                  aria-hidden="true"
                >
                  <Clock3 className="w-3.5 h-3.5" />
                </span>
              </div>
            )}
          </nav>

          {/* Bottom: Work/Life toggle + Settings — only in expanded mode. */}
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
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                        {language === 'zh' ? '模式' : 'Mode'}
                      </span>
                      <span className="text-[10px] text-text-muted/70">
                        {activeContext === 'work'
                          ? language === 'zh' ? '工作中' : 'On the clock'
                          : language === 'zh' ? '生活里' : 'Off the clock'}
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
                        <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
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
                        <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                        {language === 'zh' ? '生活' : 'Life'}
                      </button>
                    </div>
                  </div>
                )}

                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    data-testid="settings-button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-heading rounded-lg transition-colors hover:bg-black/[0.03] active:scale-[0.99]"
                  >
                    <Settings className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
                    {language === 'zh' ? '设置' : 'Settings'}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact: just the work/life dot + settings icon at the bottom */}
          {isCompact && (
            <div className="mt-auto pt-3 border-t border-border/60 flex flex-col items-center gap-1">
              {onContextChange && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextChange('work');
                    }}
                    data-testid="mode-work"
                    aria-label={language === 'zh' ? '工作' : 'Work'}
                    aria-pressed={activeContext === 'work'}
                    className={`p-2 rounded-lg transition-colors ${
                      activeContext === 'work'
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'
                    }`}
                    title={language === 'zh' ? '工作' : 'Work'}
                  >
                    <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextChange('life');
                    }}
                    data-testid="mode-life"
                    aria-label={language === 'zh' ? '生活' : 'Life'}
                    aria-pressed={activeContext === 'life'}
                    className={`p-2 rounded-lg transition-colors ${
                      activeContext === 'life'
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-muted hover:text-text-heading hover:bg-black/[0.03]'
                    }`}
                    title={language === 'zh' ? '生活' : 'Life'}
                  >
                    <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
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
