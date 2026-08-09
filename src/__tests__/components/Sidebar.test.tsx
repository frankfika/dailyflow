import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../../components/Sidebar';

vi.mock('motion/react', () => ({
  motion: {
    aside: ({ children, animate, initial, transition, ...props }: any) =>
      React.createElement('aside', { ...props, style: { width: animate?.width } }, children),
    div: ({ children, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('div', props, children),
    span: ({ children, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('span', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

vi.mock('lucide-react', () => {
  const Icon = () => React.createElement('span');
  return {
    CalendarDays: Icon,
    Clock3: Icon,
    X: Icon,
    FileText: Icon,
    ListTodo: Icon,
    MessageCircle: Icon,
    Search: Icon,
    Settings: Icon,
    Briefcase: Icon,
    Heart: Icon,
    PanelLeftClose: Icon,
    Network: Icon,
  };
});

vi.mock('../../api/client', () => ({
  filesApi: { create: vi.fn() },
}));

function SidebarHarness() {
  const [open, setOpen] = useState(false);
  return (
    <Sidebar
      language="en"
      isSidebarOpen={open}
      setIsSidebarOpen={setOpen}
      activeTab="today"
      setActiveTab={vi.fn()}
      currentFileDate="2026-08-09"
      setCurrentFileDate={vi.fn()}
      filesMap={{}}
      setFilesMap={vi.fn()}
      recentDates={[]}
      archivedMonths={{}}
      expandedArchiveMonths={{}}
      toggleArchiveMonth={vi.fn()}
      showToast={vi.fn()}
    />
  );
}

describe('Sidebar desktop compact mode', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn().mockReturnValue('true'),
        setItem: vi.fn(),
      },
    });
  });

  it('keeps a visible navigation rail when collapsed', () => {
    render(<SidebarHarness />);

    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(navigation).toHaveAttribute('data-state', 'compact');
    expect(navigation).toHaveStyle({ width: '60px' });
    expect(screen.getByTestId('sidebar-inner')).toHaveStyle({ width: '60px' });
    expect(screen.getByRole('button', { name: 'Today' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'AI Chat' })).toBeVisible();
  });
});
