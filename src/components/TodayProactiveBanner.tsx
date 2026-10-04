/**
 * TodayProactiveBanner — wires ProactiveSuggestionsCard to the v2 API.
 *
 * Fetches /api/v2/proactive/scan?channel=today_load lazily when the user
 * opens the Today tab on today's date. Re-fetches when the parent signals
 * a change (e.g. after accepting/dismissing someone applied elsewhere).
 *
 * The component is intentionally lightweight — it never blocks the
 * surrounding Today screen. If the scan fails (e.g. v2 is disabled), it
 * silently renders nothing.
 */
import { useEffect, useState } from 'react';
import { ProactiveSuggestionsCard } from './ProactiveSuggestionsCard';
import {
  proactiveApi,
  type ProactiveProposal,
  type ProactiveQuota,
  type ProactiveSuggestion,
} from '../api/client';

interface TodayProactiveBannerProps {
  language: 'en' | 'zh';
  activeTab: string;
  currentFileDate: string;
  /** How to interpret "today". Same as the global `getTodayStr()`. */
  isToday: boolean;
  /** Optional bump-counter to force a refetch after the user acted. */
  refreshKey?: number;
  /** When the user accepts a suggestion (move_to_today, mark_done, regroup). */
  onApplySuggestion?: (
    proposal: ProactiveProposal,
    suggestion: ProactiveSuggestion,
  ) => void | Promise<void>;
  /** When the user dismisses the whole card via the corner X. */
  onDismissAll?: () => void;
}

export function TodayProactiveBanner({
  language,
  activeTab,
  currentFileDate,
  isToday,
  refreshKey,
  onApplySuggestion,
  onDismissAll,
}: TodayProactiveBannerProps) {
  const [proposals, setProposals] = useState<ProactiveProposal[]>([]);
  const [quota, setQuota] = useState<ProactiveQuota | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (activeTab !== 'today') return;
    if (!isToday) return;
    let cancelled = false;
    proactiveApi
      .scan('today_load')
      .then(({ proposals: items, quota: q }) => {
        if (cancelled) return;
        setProposals(items);
        setQuota(q);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Silent: v2 may be disabled, the workspace may not exist, etc.
        setProposals([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, isToday, refreshKey]);

  // Optimistic update: drop the proposal from the local list once the
  // user acts so the card disappears without a full refetch.
  // Drop the proposal only after the action truly succeeded — C12 gates
  // move_to_today / mark_done behind a confirm dialog, and a cancel (or a
  // failed write) must leave the card in place for another decision.
  const handleApplySuggestion = async (
    proposal: ProactiveProposal,
    suggestion: ProactiveSuggestion,
  ) => {
    if (onApplySuggestion) {
      await onApplySuggestion(proposal, suggestion);
    }
    setProposals(prev => prev.filter(p => p.id !== proposal.id));
  };

  // A5: the corner X must actually dismiss — C11 batch-dismiss every visible
  // proposal by entity id (proposal ids rotate per scan, entity ids don't).
  const handleDismissAll = () => {
    const entityIds = proposals.map(p => p.entityId).filter(Boolean);
    setProposals([]);
    if (entityIds.length > 0) {
      // Fire-and-forget: the optimistic clear above keeps the UI snappy; the
      // parent refreshKey bump refetches the now-empty list either way.
      void proactiveApi.dismissBatch(entityIds).catch(() => {});
    }
    if (onDismissAll) onDismissAll();
  };

  if (!loaded) return null;
  if (proposals.length === 0) return null;
  return (
    <ProactiveSuggestionsCard
      language={language}
      proposals={proposals}
      quota={quota}
      onApplySuggestion={handleApplySuggestion}
      onDismissAll={handleDismissAll}
    />
  );
}
