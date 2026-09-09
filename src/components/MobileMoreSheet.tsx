/**
 * MobileMoreSheet — bottom slide-up sheet that surfaces the secondary
 * navigation destinations (Calendar, Memory, Team) plus Settings on
 * phones. Exists because the mobile tab bar can only show four primary
 * destinations + the quick-add affordance without crowding 320-375px
 * viewports; the remaining tabs are otherwise unreachable without
 * opening the sidebar overlay, which the audit flagged as undiscoverable.
 *
 * Behavior:
 *   - Slides up from the bottom of the viewport with the same spring
 *     motion vocabulary as the rest of the app's mobile surfaces.
 *   - Backdrop tap and Esc both close; selection also closes.
 *   - Highlights whichever sheet item matches the active AppTab so the
 *     user keeps a sense of "where am I" even after the sheet closes.
 *   - `sm:hidden` keeps the sheet from rendering on tablet/desktop where
 *     the sidebar owns the same surface.
 */
import { motion, AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { Brain, Calendar, Settings, Users, X } from 'lucide-react';
import type { AppTab } from '../App';

export interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  activeTab: AppTab;
  /** Called when a tab-destined item is picked; the parent's setActiveTab
   *  handles the today/events vs overlay routing. */
  onSelectTab: (tab: AppTab) => void;
  /** Optional: tapping Settings calls this and closes the sheet. */
  onOpenSettings?: () => void;
}

interface MoreItem {
  id: 'calendar' | 'memory' | 'team' | 'settings';
  label: { en: string; zh: string };
  icon: typeof Calendar;
  /** When set, the item routes to this AppTab and the row highlights
   *  when activeTab matches. */
  tab?: AppTab;
}

const MORE_ITEMS: ReadonlyArray<MoreItem> = [
  { id: 'calendar', label: { en: 'Calendar', zh: '日历' }, icon: Calendar, tab: 'calendar' },
  { id: 'memory', label: { en: 'Memory', zh: '记忆' }, icon: Brain, tab: 'memory' },
  { id: 'team', label: { en: 'Team', zh: '团队' }, icon: Users, tab: 'team' },
  { id: 'settings', label: { en: 'Settings', zh: '设置' }, icon: Settings },
];

export function MobileMoreSheet({
  open,
  onClose,
  language,
  activeTab,
  onSelectTab,
  onOpenSettings,
}: MobileMoreSheetProps) {
  // Esc closes the sheet (matches the rest of the app's "Esc dismisses
  // any open overlay" convention).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleItem = (item: MoreItem) => () => {
    if (item.tab) {
      onSelectTab(item.tab);
    } else if (item.id === 'settings') {
      onOpenSettings?.();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 sm:hidden"
          data-testid="mobile-more-sheet"
        >
          <motion.button
            type="button"
            aria-label={language === 'zh' ? '关闭' : 'Close'}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/40"
            data-testid="mobile-more-backdrop"
            tabIndex={-1}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={language === 'zh' ? '更多' : 'More'}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-border bg-surface-elevated/95 px-3 pb-5 pt-2 shadow-2xl backdrop-blur-md"
            style={{ paddingBottom: 'max(1.25rem, var(--safe-bottom, 0px))' }}
            data-testid="mobile-more-panel"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-text-muted/30"
            />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-text-heading">
                {language === 'zh' ? '更多' : 'More'}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label={language === 'zh' ? '关闭' : 'Close'}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-black/5 hover:text-text-heading"
                data-testid="mobile-more-close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="space-y-1">
              {MORE_ITEMS.map((item) => {
                const active = item.tab !== undefined && activeTab === item.tab;
                const Icon = item.icon;
                const testId = item.tab
                  ? `mobile-more-${item.tab}`
                  : `mobile-more-${item.id}`;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={handleItem(item)}
                      data-testid={testId}
                      data-active={active}
                      className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:scale-[0.98] ${
                        active
                          ? 'bg-accent-light text-accent'
                          : 'text-text-main hover:bg-black/[0.04]'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="flex-1 text-sm font-medium">
                        {language === 'zh' ? item.label.zh : item.label.en}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
