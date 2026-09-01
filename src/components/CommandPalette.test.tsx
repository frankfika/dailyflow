import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

const noop = vi.fn();

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  return render(
    <CommandPalette
      open
      onClose={noop}
      language="en"
      tasks={[
        { id: 't1', title: 'Ship release', status: 'todo' },
        { id: 't2', title: 'Buy milk', status: 'done' },
      ]}
      notes={[{ id: 'n1', title: 'Weekly review' }]}
      events={[{ id: 'e1', title: 'DSH project' }]}
      workspaces={[{ id: 'w1', name: 'Main' }]}
      activeWorkspaceId="w1"
      onSelectTask={noop}
      onSelectNote={noop}
      onSelectEvent={noop}
      onSelectWorkspace={noop}
      onCommand={noop}
      {...overrides}
    />,
  );
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(<CommandPalette
      open={false}
      onClose={noop}
      language="en"
      tasks={[]}
      notes={[]}
      events={[]}
      workspaces={[]}
      activeWorkspaceId={null}
      onSelectTask={noop}
      onSelectNote={noop}
      onSelectEvent={noop}
      onSelectWorkspace={noop}
      onCommand={noop}
    />);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('lists search results excluding done tasks and management commands', () => {
    renderPalette();
    expect(screen.getByTestId('cmdk-item-event-e1')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-task-t1')).toBeInTheDocument();
    expect(screen.queryByTestId('cmdk-item-task-t2')).not.toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-settings')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-pick-date')).toBeInTheDocument();
    expect(screen.getByTestId('cmdk-item-switch-workspace')).toBeInTheDocument();
  });

  it('filters items by query', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dsh' } });
    expect(screen.getByTestId('cmdk-item-event-e1')).toBeInTheDocument();
    expect(screen.queryByTestId('cmdk-item-task-t1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cmdk-item-settings')).not.toBeInTheDocument();
  });

  it('runs a command and closes on Enter', () => {
    const onClose = vi.fn();
    const onCommand = vi.fn();
    const { rerender } = renderPalette({ onClose, onCommand });

    // Narrow to a single command so index 0 is deterministic.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'leftovers' } });
    fireEvent.keyDown(screen.getByTestId('command-palette'), { key: 'Enter' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith('rollover');
    rerender(<CommandPalette
      open={false}
      onClose={onClose}
      language="en"
      tasks={[]}
      notes={[]}
      events={[]}
      workspaces={[]}
      activeWorkspaceId={null}
      onSelectTask={noop}
      onSelectNote={noop}
      onSelectEvent={noop}
      onSelectWorkspace={noop}
      onCommand={onCommand}
    />);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('closes on Escape without running anything', () => {
    const onClose = vi.fn();
    const onSelectEvent = vi.fn();
    renderPalette({ onClose, onSelectEvent });
    fireEvent.keyDown(screen.getByTestId('command-palette'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectEvent).not.toHaveBeenCalled();
  });

  it('jumps to an event on click', () => {
    const onClose = vi.fn();
    const onSelectEvent = vi.fn();
    renderPalette({ onClose, onSelectEvent });
    fireEvent.click(screen.getByTestId('cmdk-item-event-e1'));
    expect(onSelectEvent).toHaveBeenCalledWith('e1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
