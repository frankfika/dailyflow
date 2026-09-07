/**
 * Proactive Suggestions Card (Gap 3 — Sprint 1).
 *
 * Shown at the top of the Today view. Receives a list of "agent suggestions" produced
 * by GET /api/v2/proactive/scan. Each suggestion carries a small action menu
 * (move_to_today, mark_done, dismiss, regroup). The card itself decides:
 *   - 0 proposals   → render null
 *   - 1 proposal    → render one big card
 *   - 2+ proposals  → render collapsible list
 *
 * The component never blocks the Today screen — it works only when the
 * server actually returns proposals (which is 0 most of the time).
 *
 * The card does NOT mutate the underlying commitment directly. Instead it
 * either:
 *   (a) hands the suggestion to the parent's callback (e.g. so the parent
 *       can call /proposals/draft to make a real Proposal), or
 *   (b) fires the proposal action endpoint via POST /proactive/:id/action.
 *
 * The "view mode" demo path is async-safe: every action is idempotent and
 * the parent can re-fetch the scan list when the user comes back.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, Sparkles, X } from 'lucide-react';
import {
  proactiveApi,
  type ProactiveProposal,
  type ProactiveSuggestion as Suggestion,
} from '../api/client';

interface ProactiveSuggestionsCardProps {
  language: 'en' | 'zh';
  proposals: ProactiveProposal[];
  /** Called when the user accepts a suggestion ("move to today", etc.). */
  onApplySuggestion?: (
    proposal: ProactiveProposal,
    suggestion: Suggestion,
  ) => void | Promise<void>;
  /** Called when the user dismisses the entire card. */
  onDismissAll?: () => void;
}

const SEVERITY_LABEL: Record<ProactiveProposal['severity'], { zh: string; en: string }> = {
  info: { zh: '提示', en: 'Info' },
  warning: { zh: '建议', en: 'Suggestion' },
  urgent: { zh: '紧急', en: 'Urgent' },
};

const ACTION_BUTTON_CLS: Record<Suggestion['action'], string> = {
  move_to_today:
    'bg-accent text-white hover:bg-accent/90 active:bg-accent/95',
  mark_done:
    'bg-white border border-border text-text-heading hover:bg-surface',
  regroup:
    'bg-white border border-border text-text-heading hover:bg-surface',
  dismiss:
    'text-text-muted hover:bg-black/[0.04] hover:text-text-heading',
};

export function ProactiveSuggestionsCard({
  language,
  proposals,
  onApplySuggestion,
  onDismissAll,
}: ProactiveSuggestionsCardProps) {
  const isZh = language === 'zh';
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (proposals.length === 0) return null;

  // Per spec: > 3 proposals collapse to the first card; 1-3 show all.
  const COLLAPSE_THRESHOLD = 3;
  const collapsed = proposals.length > COLLAPSE_THRESHOLD && !showAll;
  const visible = collapsed ? proposals.slice(0, 1) : proposals;
  const hidden = proposals.length - 1;

  const handleAction = async (proposal: ProactiveProposal, suggestion: Suggestion) => {
    setBusyId(proposal.id);
    try {
      // Record the user action so the server can dedupe next time.
      if (suggestion.action === 'dismiss') {
        await proactiveApi.recordAction(proposal.id, 'dismissed');
      } else if (onApplySuggestion) {
        await onApplySuggestion(proposal, suggestion);
        await proactiveApi.recordAction(proposal.id, 'accepted');
      }
    } finally {
      setBusyId(null);
    }
  };

  const headerText = isZh
    ? `Agent 建议 (${proposals.length})`
    : `Agent suggestions (${proposals.length})`;
  const collapseLabel = isZh ? '折叠' : 'Collapse';
  const expandLabel = isZh
    ? `展开其余 ${hidden} 条`
    : `Show ${hidden} more`;
  const dismissAllLabel = isZh ? '全部关闭' : 'Dismiss all';

  return (
    <section
      data-testid="proactive-suggestions-card"
      aria-label={isZh ? 'Agent 主动建议' : 'Agent proactive suggestions'}
      className="today-proactive-card mb-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="today-proactive-icon h-3.5 w-3.5" aria-hidden="true" />
          <h2 className="text-xs font-semibold text-text-heading">{headerText}</h2>
        </div>
        <div className="flex items-center gap-1">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted hover:bg-black/[0.04] hover:text-text-heading"
              data-testid="proactive-expand"
            >
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              {expandLabel}
            </button>
          ) : (
            proposals.length > COLLAPSE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted hover:bg-black/[0.04] hover:text-text-heading"
                data-testid="proactive-collapse"
              >
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
                {collapseLabel}
              </button>
            )
          )}
          {onDismissAll && (
            <button
              type="button"
              onClick={onDismissAll}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted hover:bg-black/[0.04] hover:text-text-heading"
              aria-label={dismissAllLabel}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <ul className="mt-2 flex flex-col gap-2" data-testid="proactive-list">
        {visible.map((proposal) => {
          const sev = SEVERITY_LABEL[proposal.severity];
          return (
            <li
              key={proposal.id}
              data-testid="proposal-item"
              data-kind={proposal.kind}
                  className={`today-proactive-item ${busyId === proposal.id ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                  <Lightbulb className="today-proactive-icon h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-semibold">{proposal.title}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-main/85">
                    {proposal.body}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-current/30 px-1.5 py-0.5 text-[11px] font-medium">
                  {isZh ? sev.zh : sev.en}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                {proposal.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.action}
                    type="button"
                    disabled={busyId === proposal.id}
                    onClick={() => handleAction(proposal, suggestion)}
                    data-testid="proposal-action"
                    data-action={suggestion.action}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${ACTION_BUTTON_CLS[suggestion.action]}`}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
