/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NoteCard, highlightMentions, renderMarkdownPreview } from '../../components/NoteCard';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('div', props, children),
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  FileText: () => React.createElement('span', { 'data-testid': 'icon-file' }),
  Mic: () => React.createElement('span', { 'data-testid': 'icon-mic' }),
  Sparkles: () => React.createElement('span', { 'data-testid': 'icon-sparkles' }),
  Clock: () => React.createElement('span', { 'data-testid': 'icon-clock' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  Edit2: () => React.createElement('span', { 'data-testid': 'icon-edit' }),
  Users: () => React.createElement('span', { 'data-testid': 'icon-users' }),
  Link: () => React.createElement('span', { 'data-testid': 'icon-link' }),
}));

vi.mock('../../utils/tagColors', () => ({
  getTagColor: () => 'bg-gray-100 text-gray-700',
}));

// Capture what ReactMarkdown receives
let lastMarkdownChildren = '';
vi.mock('react-markdown', () => ({
  default: ({ children }: any) => {
    lastMarkdownChildren = children;
    return React.createElement('div', { 'data-testid': 'react-markdown' }, children);
  },
}));

vi.mock('remark-gfm', () => ({
  default: () => () => {},
}));

const baseNote = {
  id: 'note-1',
  title: 'My Note',
  body: '## Subtitle\n\nSome content with @alice and @bob.',
  type: 'note' as const,
  context: 'work' as const,
  tags: ['idea'],
  date: '2024-01-15',
  time: '10:00',
  linkedTaskIds: [],
  linkedProjectIds: [],
  mentions: ['alice', 'bob'],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  filePath: '',
};

describe('highlightMentions', () => {
  it('returns plain text when no mentions', () => {
    const result = highlightMentions('Hello world');
    expect(result).toBe('Hello world');
  });

  it('wraps mentions in button elements inside an array', () => {
    const result = highlightMentions('Hey @alice there');
    expect(Array.isArray(result)).toBe(true);
    const nodes = result as any[];
    const button = nodes.find((n) => n?.type === 'button');
    expect(button).toBeDefined();
    expect(button?.props.children).toBe('@alice');
  });

  it('handles multiple mentions', () => {
    const result = highlightMentions('@alice and @bob');
    const nodes = result as any[];
    const buttons = nodes.filter((n) => n?.type === 'button');
    expect(buttons.length).toBe(2);
  });

  it('calls onMentionClick when mention button clicked', () => {
    const onClick = vi.fn();
    const result = highlightMentions('Hello @alice', onClick);
    const nodes = result as any[];
    const button = nodes.find((n) => n?.type === 'button');
    expect(button).toBeDefined();

    const fakeEvent = { stopPropagation: vi.fn() };
    button.props.onClick(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith('alice');
  });

  it('handles Chinese names in mentions', () => {
    const result = highlightMentions('联系@张三');
    const nodes = result as any[];
    const button = nodes.find((n) => n?.type === 'button');
    expect(button).toBeDefined();
    expect(button?.props.children).toBe('@张三');
  });
});

describe('renderMarkdownPreview', () => {
  beforeEach(() => {
    lastMarkdownChildren = '';
  });

  const renderPreview = (body: string, maxChars?: number) => {
    // We must render the returned React node so the mocked ReactMarkdown executes
    render(<>{renderMarkdownPreview(body, undefined, maxChars)}</>);
    return lastMarkdownChildren;
  };

  it('returns null for empty body', () => {
    expect(renderMarkdownPreview('')).toBeNull();
    expect(renderMarkdownPreview('   ')).toBeNull();
  });

  it('strips H1 lines to avoid duplicating title', () => {
    const passed = renderPreview('# Title\n\nBody content');
    expect(passed).not.toContain('# Title');
    expect(passed).toContain('Body content');
  });

  it('preserves H2 and other markdown', () => {
    const passed = renderPreview('## Subtitle\n\n- item 1\n- item 2');
    expect(passed).toContain('## Subtitle');
    expect(passed).toContain('- item 1');
  });

  it('truncates long content to maxChars', () => {
    const longBody = 'a'.repeat(500);
    const passed = renderPreview(longBody, 100);
    expect(passed.length).toBeLessThanOrEqual(103);
    expect(passed).toContain('…');
  });

  it('does not truncate short content', () => {
    const shortBody = 'Short text';
    const passed = renderPreview(shortBody);
    expect(passed).toBe(shortBody);
    expect(passed).not.toContain('…');
  });
});

describe('NoteCard component', () => {
  it('renders note title and body preview', () => {
    render(<NoteCard note={baseNote} language="en" />);
    expect(screen.getByText('My Note')).toBeInTheDocument();
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    render(<NoteCard note={baseNote} language="en" onClick={onClick} />);

    const card = screen.getByText('My Note').closest('.floating-card');
    fireEvent.click(card!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit when edit button clicked', () => {
    const onEdit = vi.fn();
    render(<NoteCard note={baseNote} language="en" onEdit={onEdit} />);

    const editBtn = screen.getByTestId('icon-edit').parentElement;
    fireEvent.click(editBtn!);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    render(<NoteCard note={baseNote} language="en" onDelete={onDelete} />);

    const deleteBtn = screen.getByTestId('icon-trash').parentElement;
    fireEvent.click(deleteBtn!);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not render body in compact mode', () => {
    render(<NoteCard note={baseNote} language="en" compact />);
    expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument();
    expect(screen.getByText('My Note')).toBeInTheDocument();
  });

  it('shows linked task count badge', () => {
    const noteWithTasks = { ...baseNote, linkedTaskIds: ['task-1', 'task-2'] };
    render(<NoteCard note={noteWithTasks} language="en" />);
    expect(screen.getByText((content) => content.includes('2') && content.includes('tasks'))).toBeInTheDocument();
  });

  it('renders Chinese labels when language is zh', () => {
    render(<NoteCard note={baseNote} language="zh" />);
    expect(screen.getByText('笔记')).toBeInTheDocument();
  });
});
