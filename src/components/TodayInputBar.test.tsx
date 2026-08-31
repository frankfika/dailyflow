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
      onBrainExtract={vi.fn(async () => [])}
      brainPreviewTasks={null}
      onBrainPreviewAdd={noop}
      onBrainPreviewRewrite={noop}
      onBrainPreviewRemove={noop}
      onBrainPreviewCancel={noop}
      rewritingPreviewId={null}
      onAsk={noop}
      aiAnswer={null}
      onAnswerClose={noop}
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

  it('opens the brainstorm panel and extracts into the preview list', async () => {
    const onBrainExtract = vi.fn(async () => [{ id: 'bp_1', title: 'Task one' }]);
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
          onBrainExtract={onBrainExtract}
          brainPreviewTasks={null}
          onBrainPreviewAdd={noop}
          onBrainPreviewRewrite={noop}
          onBrainPreviewRemove={noop}
          onBrainPreviewCancel={noop}
          rewritingPreviewId={null}
          onAsk={noop}
          aiAnswer={null}
          onAnswerClose={noop}
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

    await vi.waitFor(() => expect(onBrainExtract).toHaveBeenCalledWith('idea one'));
    await vi.waitFor(() => expect(screen.queryByTestId('brain-dump-textarea')).not.toBeInTheDocument());
  });

  it('shows the brainstorm preview and adds only included tasks', () => {
    const onAdd = vi.fn();
    render(
      <TodayInputBar
        language="en"
        activeContext="work"
        categories={[]}
        brainDumpText=""
        setBrainDumpText={noop}
        isProcessingBrainDump={false}
        onBrainExtract={vi.fn(async () => [])}
        brainPreviewTasks={[
          { id: 'bp_1', title: 'Keep me' },
          { id: 'bp_2', title: 'Drop me' },
        ]}
        onBrainPreviewAdd={onAdd}
        onBrainPreviewRewrite={noop}
        onBrainPreviewRemove={noop}
        onBrainPreviewCancel={noop}
        rewritingPreviewId={null}
        onAsk={noop}
        aiAnswer={null}
        onAnswerClose={noop}
        onAddTask={noop}
      />,
    );
    expect(screen.getByTestId('brain-preview-panel')).toHaveTextContent('2 tasks');

    // Exclude the second row, then add — only the included one reaches App.
    fireEvent.click(screen.getByTestId('brain-preview-row-bp_2').querySelector('.today-input-preview-check') as HTMLElement);
    fireEvent.click(screen.getByTestId('brain-preview-add'));
    expect(onAdd).toHaveBeenCalledWith([{ id: 'bp_1', title: 'Keep me' }]);

    // Removing the last row hands removal to App (which closes the preview).
    fireEvent.click(screen.getByTestId('brain-preview-remove-bp_1'));
    expect(noop).toHaveBeenCalledWith('bp_1');
  });

  it('routes ?-prefixed input to the AI ask flow and shows the answer', async () => {
    const onAsk = vi.fn();
    const onAdopt = vi.fn();
    renderBar({
      onAsk,
      aiAnswer: { answer: 'Focus on the release first.', suggestedTitle: 'Ship the release' },
      onAnswerAdopt: onAdopt,
    });

    // Answer panel renders with an adopt button.
    expect(screen.getByTestId('ai-answer-panel')).toHaveTextContent('Focus on the release first.');
    fireEvent.click(screen.getByTestId('ai-answer-adopt'));
    expect(onAdopt).toHaveBeenCalledWith('Ship the release');

    // Typing a `?` question routes to onAsk instead of adding a task.
    const input = screen.getByTestId('quick-task-input');
    fireEvent.change(input, { target: { value: '？今天先做什么' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAsk).toHaveBeenCalledWith('今天先做什么');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });
});
