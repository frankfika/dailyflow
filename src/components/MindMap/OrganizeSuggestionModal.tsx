/**
 * OrganizeSuggestionModal — shows the result of `organizeMindmap()` as
 * a reviewable "proposal card". The user can apply (writes back the
 * proposed groups + suggested edges) or reject (dismisses).
 *
 * Shape conforms to OrganizeSuggestion in src/api/client.ts.
 */
import { useState } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import type { OrganizeSuggestion, OrganizeStrategy } from '../../api/client';

export interface OrganizeSuggestionModalProps {
  open: boolean;
  strategy: OrganizeStrategy | null;
  suggestion: OrganizeSuggestion | null;
  language: 'en' | 'zh';
  onApply: (suggestion: OrganizeSuggestion) => Promise<void> | void;
  onClose: () => void;
}

const LANG = {
  zh: {
    title: 'AI 整理建议',
    apply: '应用',
    reject: '拒绝',
    groups: '建议分组',
    edges: '建议连接',
    rationale: '理由',
    stats: '统计',
    noSuggestion: 'AI 没有给出建议（节点可能都已经在合理位置）',
    looseNodes: '未分组',
    organizedNodes: '已覆盖',
    groupCount: '分组数',
  },
  en: {
    title: 'AI Organize Suggestion',
    apply: 'Apply',
    reject: 'Reject',
    groups: 'Suggested groups',
    edges: 'Suggested connections',
    rationale: 'Rationale',
    stats: 'Stats',
    noSuggestion: 'No suggestions (nodes may already be well-organised)',
    looseNodes: 'Loose',
    organizedNodes: 'Organized',
    groupCount: 'Groups',
  },
};

const STRATEGY_LABELS: Record<OrganizeStrategy, { zh: string; en: string }> = {
  by_topic: { zh: '按主题分类', en: 'Group by topic' },
  by_priority: { zh: '按执行状态分类', en: 'Group by execution status' },
  by_time: { zh: '按时间标签分类', en: 'Group by time tag' },
};

export function OrganizeSuggestionModal({
  open,
  strategy,
  suggestion,
  language,
  onApply,
  onClose,
}: OrganizeSuggestionModalProps) {
  const L = LANG[language];
  const [applying, setApplying] = useState(false);
  if (!open) return null;

  const hasGroups = suggestion && suggestion.groups.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      data-testid="organize-suggestion-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-base font-semibold text-text-heading">{L.title}</h2>
            {strategy && (
              <span className="ml-2 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[12px] font-medium text-[var(--color-accent)]">
                {STRATEGY_LABELS[strategy][language]}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-black/5"
            data-testid="organize-suggestion-close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {!suggestion ? (
            <p className="text-sm text-text-muted">{L.noSuggestion}</p>
          ) : (
            <>
              <section className="mb-4" data-testid="organize-rationale">
                <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-muted">{L.rationale}</h3>
                <p className="text-sm text-text-main">{suggestion.rationale}</p>
              </section>

              {suggestion.stats && (
                <section className="mb-4 grid grid-cols-3 gap-2 text-center" data-testid="organize-stats">
                  <div className="rounded-lg bg-black/[0.03] p-2">
                    <div className="text-[11px] uppercase text-text-muted">{L.groupCount}</div>
                    <div className="text-base font-semibold text-text-heading">{suggestion.stats.groupCount}</div>
                  </div>
                  <div className="rounded-lg bg-black/[0.03] p-2">
                    <div className="text-[11px] uppercase text-text-muted">{L.organizedNodes}</div>
                    <div className="text-base font-semibold text-text-heading">{suggestion.stats.organizedNodes}</div>
                  </div>
                  <div className="rounded-lg bg-black/[0.03] p-2">
                    <div className="text-[11px] uppercase text-text-muted">{L.looseNodes}</div>
                    <div className="text-base font-semibold text-text-heading">{suggestion.stats.looseNodes}</div>
                  </div>
                </section>
              )}

              {hasGroups && (
                <section className="mb-4">
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">{L.groups}</h3>
                  <ul className="space-y-2" data-testid="organize-groups">
                    {suggestion.groups.map((g, i) => (
                      <li key={i} className="rounded-lg border border-border bg-white/60 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-text-heading">{g.parentText}</span>
                          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-text-muted">
                            {g.parentKind}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-text-muted">
                          {g.nodeIds.length} {language === 'zh' ? '个节点' : 'nodes'}
                        </p>
                        {suggestion.groupRationale?.[g.parentText] && (
                          <p className="mt-1 text-[12px] text-text-muted/80 italic">
                            {suggestion.groupRationale[g.parentText]}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-text-muted hover:bg-black/5"
            data-testid="organize-suggestion-reject"
          >
            {L.reject}
          </button>
          <button
            type="button"
            disabled={!hasGroups || applying}
            onClick={async () => {
              if (!suggestion) return;
              setApplying(true);
              try {
                await onApply(suggestion);
              } finally {
                setApplying(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-95 disabled:opacity-50"
            data-testid="organize-suggestion-apply"
          >
            <Check className="h-3.5 w-3.5" />
            {L.apply}
          </button>
        </footer>
      </div>
    </div>
  );
}
