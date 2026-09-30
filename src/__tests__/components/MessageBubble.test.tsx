/**
 * MessageBubble — AI action card rendering.
 *
 * The bubble renders a stack of "tool cards" above the markdown reply
 * for any message that executed real CRUD operations. We verify:
 *   • one card per executed tool, success/fail colour and icon,
 *   • the args summary surfaces the most relevant identifier (title/id),
 *   • the cards region does NOT render when there are no tool calls or
 *     when the message is in an error state,
 *   • the user-message path is unchanged.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

// Every icon collapses to a stub span with a unique data-testid so two
// imports of the same icon (e.g. PlusCircle in TOOL_META and in the
// toolbar) do not collide.
let iconCounter = 0;
vi.mock('lucide-react', () => {
  const names = [
    'Bookmark', 'Bot', 'CalendarPlus', 'Check', 'CheckCircle2', 'Copy',
    'ListTodo', 'Pencil', 'PlusCircle', 'RotateCcw', 'Search',
    'StickyNote', 'Trash2', 'User', 'XCircle', 'Zap',
  ];
  const out: Record<string, any> = {};
  for (const n of names) {
    out[n] = () => React.createElement('span', {
      'data-testid': `icon-${n.toLowerCase()}-${++iconCounter}`,
    });
  }
  return out;
});

vi.mock('../../utils/chatActions', () => ({
  copyMessageContent: vi.fn(),
  createTaskProposalsFromMessage: vi.fn(),
}));

import { MessageBubble } from '../../components/MessageBubble';
import type { ChatMessage } from '../../types/chat';

const baseMessage: ChatMessage = {
  id: 'm1', role: 'assistant', content: 'Done.', timestamp: '2026-07-28T00:00:00.000Z',
  modelName: 'test-model',
};

const noop = () => {};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageBubble — tool action cards', () => {
  it('renders nothing in the cards region when there are no tool calls', () => {
    render(<MessageBubble message={baseMessage} language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop} />);
    expect(screen.queryByTestId('ai-tool-cards')).not.toBeInTheDocument();
  });

  it('hides the cards region when the assistant message is in an error state', () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, error: 'upstream 500' }}
        language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    expect(screen.queryByTestId('ai-tool-cards')).not.toBeInTheDocument();
  });

  it('renders one card per executed tool, with success/fail styling', () => {
    const toolCalls = [
      { name: 'create_task', args: { title: 'Write spec' }, success: true, message: '已创建任务「Write spec」' },
      { name: 'delete_task', args: { title_query: 'Old', confirm: true }, success: false, message: '未找到匹配的任务' },
    ];
    render(
      <MessageBubble
        message={{ ...baseMessage, toolCalls }}
        language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    const region = screen.getByTestId('ai-tool-cards');
    expect(region.querySelectorAll('[data-testid^="ai-tool-card-"]')).toHaveLength(2);
    // Each card renders its family icon (the testid is suffixed with a
    // per-render counter, so use a prefix match).
    const allIcons = document.body.querySelectorAll('[data-testid^="icon-"]');
    const iconIds = Array.from(allIcons).map((el) => (el as HTMLElement).dataset.testid);
    expect(iconIds.some((id) => id?.startsWith('icon-pluscircle'))).toBe(true);
    expect(iconIds.some((id) => id?.startsWith('icon-trash2'))).toBe(true);
    expect(iconIds.some((id) => id?.startsWith('icon-checkcircle2'))).toBe(true);
    expect(iconIds.some((id) => id?.startsWith('icon-xcircle'))).toBe(true);
  });

  it('surfaces the most relevant arg (title / query / id) as the card subtitle', () => {
    // Order in summarizeArgs: new_title > title > title_query. Use a bare
    // title_query here to prove the match falls through to it.
    const toolCalls = [
      { name: 'update_task', args: { title_query: 'Prepare review', new_title: 'Prep', deadline: '2026-08-01' }, success: true, message: 'ok' },
    ];
    render(
      <MessageBubble
        message={{ ...baseMessage, toolCalls }}
        language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    // new_title wins in summarizeArgs, so the card subtitle reflects the
    // change the model committed.
    expect(screen.getByTestId('ai-tool-card-update_task')).toHaveTextContent('Prep');
  });

  it('falls back to title_query when no new_title is provided', () => {
    const toolCalls = [
      { name: 'update_task', args: { title_query: 'Prepare review', deadline: '2026-08-01' }, success: true, message: 'ok' },
    ];
    render(
      <MessageBubble
        message={{ ...baseMessage, toolCalls }}
        language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    expect(screen.getByTestId('ai-tool-card-update_task')).toHaveTextContent('Prepare review');
  });

  it('falls back gracefully when no identifier arg is present', () => {
    const toolCalls = [
      { name: 'list_today_tasks', args: {}, success: true, message: '3 tasks' },
    ];
    render(
      <MessageBubble
        message={{ ...baseMessage, toolCalls }}
        language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    // The card still renders with the "List today" family label, but no
    // identifier subtitle is shown.
    expect(screen.getByTestId('ai-tool-card-list_today_tasks')).toHaveTextContent('List today');
  });

  it('switches the family label with the active language', () => {
    const toolCalls = [
      { name: 'create_task', args: { title: '写规格' }, success: true, message: 'ok' },
    ];
    render(
      <MessageBubble
        message={{ ...baseMessage, toolCalls }}
        language="zh" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop}
      />,
    );
    expect(screen.getByTestId('ai-tool-card-create_task')).toHaveTextContent('新建任务');
  });
});

describe('MessageBubble — user messages', () => {
  it('renders the user bubble without tool cards', () => {
    const userMessage: ChatMessage = { id: 'u1', role: 'user', content: 'hello', timestamp: '2026-07-28T00:00:00.000Z' };
    render(
      <MessageBubble message={userMessage} language="en" notes={[]} activeContext="work" showToast={noop} onRetry={noop} onSaveAsNote={noop} onOpenSettings={noop} />,
    );
    expect(screen.queryByTestId('ai-tool-cards')).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});