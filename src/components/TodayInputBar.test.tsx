import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayInputBar } from './TodayInputBar';

const noop = vi.fn();

function renderBar(overrides: Partial<Parameters<typeof TodayInputBar>[0]> = {}) {
  return render(
    <TodayInputBar
      language="en"
      activeContext="work"
      categories={['launch', 'errands']}
      brainDumpText=""
      setBrainDumpText={noop}
      isProcessingBrainDump={false}
      processBrainDump={vi.fn(async () => {})}
      onAddTask={noop}
      {...overrides}
    />,
  );
}

describe('TodayInputBar', () => {
  beforeEach(() => noop.mockClear());

  it('submits the typed task and keeps focus for consecutive entries', () => {
    renderBar();
    const input = screen.getByTestId('quick-task-input');
    fireEvent.change(input, { target: { value: 'Ship the release\ncheck CI logs' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(noop).toHaveBeenCalledWith({
      title: 'Ship the release',
      description: 'check CI logs',
      tags: ['work'],
      deadline: undefined,
      recurrence: undefined,
    });
    expect((screen.getByTestId('quick-task-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('defaults the context tag and keeps chosen tags with the draft', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('input-tags'));
    fireEvent.click(screen.getByRole('button', { name: '#launch' }));
    fireEvent.change(screen.getByTestId('quick-task-input'), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByTestId('input-send'));

    expect(noop).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: undefined,
      tags: ['launch', 'work'],
      deadline: undefined,
      recurrence: undefined,
    });
  });

  it('applies a deadline preset and clears it from the chip', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('input-deadline'));
    const tomorrow = screen.getByRole('button', { name: /Tomorrow/ });
    fireEvent.click(tomorrow);

    const bar = screen.getByTestId('today-input-bar');
    expect(bar).toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
    fireEvent.click(bar.querySelector('.today-input-setchip') as HTMLElement);
    expect(bar).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
  });

  it('sets a daily recurrence through the more menu', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('input-more'));
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }));

    expect(screen.getByTestId('today-input-bar')).toHaveTextContent('Daily');
  });

  it('opens the brainstorm panel and submits through processBrainDump', async () => {
    const processBrainDump = vi.fn(async () => {});
    function StatefulBar() {
      const [text, setText] = useState('');
      return (
        <TodayInputBar
          language="en"
          activeContext="work"
          categories={[]}
          brainDumpText={text}
          setBrainDumpText={setText}
          isProcessingBrainDump={false}
          processBrainDump={processBrainDump}
          onAddTask={noop}
        />
      );
    }
    render(<StatefulBar />);

    fireEvent.click(screen.getByTestId('input-more'));
    fireEvent.click(screen.getByRole('button', { name: /AI Brainstorm/ }));
    fireEvent.change(screen.getByTestId('brain-dump-textarea'), { target: { value: 'idea one' } });
    expect(screen.getByTestId('brain-dump-submit')).toBeEnabled();
    fireEvent.click(screen.getByTestId('brain-dump-submit'));

    await vi.waitFor(() => expect(processBrainDump).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.queryByTestId('brain-dump-textarea')).not.toBeInTheDocument());
  });
});
