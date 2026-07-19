/**
 * V2Shell — top-level v2 navigation between Today / Inbox / Memory.
 *
 * Spec §7.1: Today, Inbox, Memory are the three top-level views. Settings
 * is a menu item, not a tab.
 *
 * This is an additive component to the existing app. The v1 today/notes
 * /ai-chat/capsules tabs continue to work; the v2 shell is mounted when
 * the user enters "AI-Native" mode (or the user can be transitioned
 * gradually per workspace flag).
 */
import React, { useState } from 'react';
import { TodayView } from './today/TodayView';
import { InboxView } from './inbox/InboxView';
import { MemoryView } from './memory/MemoryView';

type Tab = 'today' | 'inbox' | 'memory';

const TABS: { id: Tab; label: string; subtitle: string }[] = [
  { id: 'today', label: 'Today', subtitle: '今天最值得推进什么' },
  { id: 'inbox', label: 'Inbox', subtitle: '未解释或待重新决策的内容' },
  { id: 'memory', label: 'Memory', subtitle: '已确认的工作上下文' },
];

export function V2Shell() {
  const [tab, setTab] = useState<Tab>('today');
  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-3 py-2 text-sm">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={t.subtitle}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-[var(--color-text-muted)]">
          AI-Native v2
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto">
        {tab === 'today' && <TodayView />}
        {tab === 'inbox' && <InboxView />}
        {tab === 'memory' && <MemoryView />}
      </div>
    </div>
  );
}
