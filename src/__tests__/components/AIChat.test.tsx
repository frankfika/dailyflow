/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AIChat } from '../../components/AIChat';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Send: () => React.createElement('span', { 'data-testid': 'icon-send' }),
  Plus: () => React.createElement('span', { 'data-testid': 'icon-plus' }),
  Sparkles: () => React.createElement('span', { 'data-testid': 'icon-sparkles' }),
  Loader2: () => React.createElement('span', { 'data-testid': 'icon-loader' }),
  Settings: () => React.createElement('span', { 'data-testid': 'icon-settings' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  MessageSquare: () => React.createElement('span', { 'data-testid': 'icon-msg' }),
  Paperclip: () => React.createElement('span', { 'data-testid': 'icon-clip' }),
  X: () => React.createElement('span', { 'data-testid': 'icon-x' }),
  ChevronDown: () => React.createElement('span', { 'data-testid': 'icon-chevron' }),
  Zap: () => React.createElement('span', { 'data-testid': 'icon-zap' }),
  Calendar: () => React.createElement('span', { 'data-testid': 'icon-calendar' }),
  FileText: () => React.createElement('span', { 'data-testid': 'icon-file' }),
  Folder: () => React.createElement('span', { 'data-testid': 'icon-folder' }),
  Bot: () => React.createElement('span', { 'data-testid': 'icon-bot' }),
  User: () => React.createElement('span', { 'data-testid': 'icon-user' }),
  StopCircle: () => React.createElement('span', { 'data-testid': 'icon-stop' }),
  Copy: () => React.createElement('span', { 'data-testid': 'icon-copy' }),
  PanelLeftClose: () => React.createElement('span', { 'data-testid': 'icon-panel-close' }),
  PanelLeftOpen: () => React.createElement('span', { 'data-testid': 'icon-panel-open' }),
  Bookmark: () => React.createElement('span', { 'data-testid': 'icon-bookmark' }),
}));

vi.mock('../../api/client', () => ({
  aiApi: {
    chat: vi.fn(),
    summarize: vi.fn(),
  },
  promptsApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../types/models', () => ({
  loadProviderConfigs: vi.fn().mockReturnValue({ configs: [], activeId: null }),
}));

let mockSessions: any[] = [];
let mockActiveId: string | null = null;

vi.mock('../../types/chat', () => ({
  loadChatStore: vi.fn().mockImplementation(() => ({ sessions: mockSessions, activeSessionId: mockActiveId })),
  saveChatStore: vi.fn(),
  createNewSession: vi.fn().mockImplementation(() => {
    const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    return {
      id,
      title: 'New Chat',
      messages: [],
      contextItems: [],
      createdAt: now,
      updatedAt: now,
    };
  }),
  deriveSessionTitle: vi.fn().mockReturnValue('Test Title'),
}));

vi.mock('../../components/ChatSettingsPanel', () => ({
  ChatSettingsPanel: () => React.createElement('div', { 'data-testid': 'chat-settings' }),
}));

vi.mock('../../components/ContextPicker', () => ({
  ContextPicker: ({ onSelect }: any) =>
    React.createElement('div', { 'data-testid': 'context-picker' },
      React.createElement('button', { onClick: () => onSelect?.({ id: 'ctx-1', type: 'today-tasks', label: 'Tasks' }) }, 'Pick')
    ),
}));

const baseProps = {
  language: 'en' as const,
  tasks: [],
  notes: [],
  filesMap: {},
  showToast: vi.fn(),
};

describe('AIChat initialDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions = [];
    mockActiveId = null;
  });

  it('creates a new session and prefills input when initialDraft is provided', async () => {
    const onDraftConsumed = vi.fn();
    const { rerender } = render(
      <AIChat {...baseProps} initialDraft={null} onDraftConsumed={onDraftConsumed} />
    );

    // Before draft: no textarea with draft content
    expect(screen.queryByDisplayValue('Draft content here')).not.toBeInTheDocument();

    // Provide initialDraft
    rerender(
      <AIChat
        {...baseProps}
        initialDraft={{ text: 'Draft content here', key: 'draft-1' }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Draft content here')).toBeInTheDocument();
    });

    expect(onDraftConsumed).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger for the same draft key', async () => {
    const onDraftConsumed = vi.fn();
    const { rerender } = render(
      <AIChat
        {...baseProps}
        initialDraft={{ text: 'First draft', key: 'draft-same' }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('First draft')).toBeInTheDocument();
    });
    expect(onDraftConsumed).toHaveBeenCalledTimes(1);

    // Re-render with same key — should not call onDraftConsumed again
    rerender(
      <AIChat
        {...baseProps}
        initialDraft={{ text: 'First draft', key: 'draft-same' }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    // Wait a tick to ensure effect ran
    await act(async () => {});
    expect(onDraftConsumed).toHaveBeenCalledTimes(1);
  });

  it('triggers again when draft key changes', async () => {
    const onDraftConsumed = vi.fn();
    const { rerender } = render(
      <AIChat
        {...baseProps}
        initialDraft={{ text: 'Draft A', key: 'draft-a' }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Draft A')).toBeInTheDocument();
    });
    expect(onDraftConsumed).toHaveBeenCalledTimes(1);

    // Change key
    rerender(
      <AIChat
        {...baseProps}
        initialDraft={{ text: 'Draft B', key: 'draft-b' }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Draft B')).toBeInTheDocument();
    });
    expect(onDraftConsumed).toHaveBeenCalledTimes(2);
  });

  it('does nothing when initialDraft is null', async () => {
    const onDraftConsumed = vi.fn();
    render(
      <AIChat {...baseProps} initialDraft={null} onDraftConsumed={onDraftConsumed} />
    );

    await act(async () => {});
    expect(onDraftConsumed).not.toHaveBeenCalled();
  });
});
