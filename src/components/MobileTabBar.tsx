/**
 * MobileTabBar — iOS-style bottom tab bar for the primary navigation.
 *
 * Why a separate component from the Sidebar?
 *   - Sidebar's primary purpose on mobile is folder/context management, not
 *     tab switching. Forcing users to open an overlay to change tabs feels
 *     modal-y on mobile.
 *   - iOS apps overwhelmingly use a fixed bottom tab bar for primary nav;
 *     mirroring that here makes Today → Events → Notes feel as fast as
 *     Mail / Calendar / Photos on iPhone.
 *
 * Visibility:
 *   - Hidden on tablet and desktop (sidebar owns primary nav there).
 *   - Shown on mobile (≤640px). The sidebar still exists on mobile as a
 *     "hamburger" overlay — folder / workspace / context management.
 *
 * Animation:
 *   - The active background pill uses `layoutId` so it slides between
 *     tabs with the same spring as the Sidebar nav indicator. The
 *     result reads as one consistent motion language across the app.
 */
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ListTodo, MessageCircle, Sparkles, Plus } from 'lucide-react';
import { useCallback } from 'react';
import type { AppTab } from '../App';

interface MobileTabBarProps {
  language: 'en' | 'zh';
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  /** Whether the bottom bar should be visible at all. Hidden on tablet+. */
  visible: boolean;
  /** Open the today-task quick-add sheet. */
  onAddTask?: () => void;
}

const PRIMARY_TABS: ReadonlyArray<{
  id: AppTab;
  label: { en: string; zh: string };
  icon: typeof ListTodo;
}> = [
  { id: 'today', label: { en: 'Today', zh: '今天' }, icon: ListTodo },
  { id: 'events', label: { en: 'Events', zh: '事件' }, icon: Sparkles },
  { id: 'notes', label: { en: 'Notes', zh: '笔记' }, icon: FileText },
  { id: 'ai-chat', label: { en: 'Ask AI', zh: '问 AI' }, icon: MessageCircle },
] as const;

export function MobileTabBar({
  language,
  activeTab,
  setActiveTab,
  visible,
  onAddTask,
}: MobileTabBarProps) {
  const handleClick = useCallback(
    (tab: AppTab) => () => setActiveTab(tab),
    [setActiveTab],
  );

  // Slide the bar off-screen when not visible (mount/unmount keeps the
  // motion consistent with the other "auto-disappearing" chrome).
  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          key="mobile-tab-bar"
          role="navigation"
          aria-label={language === 'zh' ? '主导航' : 'Primary navigation'}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-30 px-2 sm:hidden"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
          data-testid="mobile-tab-bar"
        >
          <div className="mx-auto mb-2 flex max-w-md items-center justify-around rounded-2xl border border-border bg-surface-elevated/95 px-1 py-1 shadow-lg backdrop-blur-md">
            {PRIMARY_TABS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={handleClick(id)}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`mobile-tab-${id}`}
                  className={`relative flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors active:scale-95 ${
                    active ? 'text-accent' : 'text-text-muted hover:text-text-heading'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-tab-active"
                      className="absolute inset-0.5 rounded-lg bg-accent-light"
                      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="relative h-4 w-4" aria-hidden="true" />
                  <span className="relative">{language === 'zh' ? label.zh : label.en}</span>
                </button>
              );
            })}
            {onAddTask && (
              <button
                type="button"
                onClick={onAddTask}
                aria-label={language === 'zh' ? '添加任务' : 'Add task'}
                data-testid="mobile-tab-add-task"
                className="relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-accent transition-colors active:scale-90"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            )}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
