import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckSquare, GitBranch, Hash, HelpCircle, Star } from 'lucide-react';
import type { MindMapNodeKind } from '../../../api/client';

interface KindOption {
  kind: MindMapNodeKind;
  label: string;
  hint: string;
  group: 'goal' | 'capture' | 'risk' | 'wrap';
  Icon: typeof CheckSquare;
}

const COPY = {
  en: {
    heading: 'Change node type',
    hint: 'Pick what this node represents.',
    groups: { goal: 'Outcome', capture: 'Capture', risk: 'Risk', wrap: 'Wrap-up' } as Record<'goal' | 'capture' | 'risk' | 'wrap', string>,
  },
  zh: {
    heading: '切换节点类型',
    hint: '选择这个节点代表的含义。',
    groups: { goal: '目标', capture: '收集', risk: '风险', wrap: '收尾' } as Record<'goal' | 'capture' | 'risk' | 'wrap', string>,
  },
} as const;

const OPTIONS: Array<{ kind: MindMapNodeKind; label: { en: string; zh: string }; hint: { en: string; zh: string }; group: 'goal' | 'capture' | 'risk' | 'wrap'; Icon: typeof CheckSquare }> = [
  { kind: 'task', label: { en: 'Task', zh: '任务' }, hint: { en: 'Concrete action to do', zh: '可执行的行动' }, group: 'goal', Icon: CheckSquare },
  { kind: 'question', label: { en: 'Question', zh: '问题' }, hint: { en: 'Open question to answer', zh: '需要回答的问题' }, group: 'capture', Icon: HelpCircle },
  { kind: 'branch', label: { en: 'Branch', zh: '分组' }, hint: { en: 'Pure structural grouping', zh: '纯结构分组' }, group: 'wrap', Icon: GitBranch },
  { kind: 'tag', label: { en: 'Tag', zh: '标签' }, hint: { en: 'Group label only', zh: '归类用的标签' }, group: 'capture', Icon: Hash },
  { kind: 'resource', label: { en: 'Resource', zh: '资料' }, hint: { en: 'Reference / link', zh: '参考 / 链接' }, group: 'capture', Icon: Star },
  { kind: 'risk', label: { en: 'Risk', zh: '风险' }, hint: { en: 'Something that could go wrong', zh: '潜在风险' }, group: 'risk', Icon: AlertTriangle },
];

export interface SlashMenuProps {
  anchor: { x: number; y: number };
  language: 'en' | 'zh';
  onPick: (kind: MindMapNodeKind) => void;
  onDismiss: () => void;
  /** Optional: hide kinds that don't apply (e.g. 'task' for non-task surfaces). */
  exclude?: ReadonlyArray<MindMapNodeKind>;
  /** Optional: filter kinds (e.g. allow only 'task' / 'branch'). */
  only?: ReadonlyArray<MindMapNodeKind>;
}

/**
 * Popover for picking a node's semantic kind. Anchored to a caret position;
 * flips when near the right/bottom edge so it never overflows the viewport.
 * Keyboard: ↑↓ to move, Enter to pick, Esc to dismiss. The popover steals
 * focus while open so the parent's input shouldn't react to the same keys.
 */
export function SlashMenu({ anchor, language, onPick, onDismiss, exclude, only }: SlashMenuProps) {
  const t = COPY[language];
  const filtered = useMemo(
    () => OPTIONS.filter((o) =>
      (!exclude || !exclude.includes(o.kind)) && (!only || only.includes(o.kind))),
    [exclude, only],
  );
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset to first item whenever the menu re-mounts (anchor changes).
  useEffect(() => { setActive(0); }, [anchor.x, anchor.y]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const picked = filtered[active];
        if (picked) onPick(picked.kind);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, filtered, onPick, onDismiss]);

  // Position with edge-flip: keep menu inside viewport (>= 8px margin).
  const MENU_W = 280;
  const MENU_MAX_H = 320;
  const left = Math.min(anchor.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - MENU_W - 8);
  const top = Math.min(anchor.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - MENU_MAX_H - 8);

  // Group by `group` to keep visual rhythm.
  const groups: Record<typeof OPTIONS[number]['group'], typeof OPTIONS> = { goal: [], capture: [], risk: [], wrap: [] };
  for (const o of filtered) groups[o.group].push(o);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={t.heading}
      data-testid="slash-menu"
      style={{ position: 'fixed', left, top, width: MENU_W, maxHeight: MENU_MAX_H }}
      className="z-50 overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-2xl dark:bg-[#101514]"
    >
      <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t.heading}</div>
      {(['goal', 'capture', 'risk', 'wrap'] as const).map((g) => groups[g].length === 0 ? null : (
        <div key={g} className="mb-1">
          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">{t.groups[g]}</div>
          {groups[g].map((opt) => {
            const flatIndex = filtered.indexOf(opt);
            const isActive = flatIndex === active;
            return (
              <button
                type="button"
                key={opt.kind}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActive(flatIndex)}
                onClick={() => onPick(opt.kind)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${isActive ? 'bg-accent/10 text-accent' : 'text-text-heading hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                data-testid={`slash-menu-option-${opt.kind}`}
              >
                <opt.Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium">{opt.label[language]}</span>
                <span className="truncate text-xs text-text-muted">{opt.hint[language]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}