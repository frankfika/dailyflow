/**
 * Tests for DailyReflectionModal (Sprint 1 Gap 5 — Daily 闭环).
 *
 * Coverage required by the spec:
 *   1. Pre-fills the three task sections and the textarea.
 *   2. Confirm calls onConfirm with a well-shaped snapshot and closes on
 *      success.
 *   3. Cancel / X / Esc all call onClose without firing onConfirm.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyReflectionModal } from './DailyReflectionModal';
import type { DailyReflectionTask } from './DailyReflectionModal';

const completed: DailyReflectionTask[] = [
  { id: 'c1', title: '发布 v2.0', tags: ['launch', 'work'] },
];
const inProgress: DailyReflectionTask[] = [
  { id: 'p1', title: '整合反馈', progress: '已收集 12 条' },
];
const postponed: DailyReflectionTask[] = [
  { id: 'w1', title: '迁库', reason: '等运维' },
];

const baseProps = {
  show: true,
  date: '2026-08-20',
  language: 'zh' as const,
  completedTasks: completed,
  inProgressTasks: inProgress,
  postponedTasks: postponed,
};

describe('DailyReflectionModal', () => {
  it('pre-fills the three task sections and the reflection textarea', () => {
    render(
      <DailyReflectionModal
        {...baseProps}
        initialReflection="进展不错"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId('daily-reflection-modal')).toBeInTheDocument();
    expect(screen.getByText('发布 v2.0')).toBeInTheDocument();
    expect(screen.getByText('整合反馈')).toBeInTheDocument();
    expect(screen.getByText('迁库')).toBeInTheDocument();
    expect(screen.getByText('#launch #work')).toBeInTheDocument();
    expect(screen.getByText('已收集 12 条')).toBeInTheDocument();
    expect(screen.getByText('原因：等运维')).toBeInTheDocument();

    const textarea = screen.getByTestId('reflection-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('进展不错');
  });

  it('confirm fires onConfirm with a shaped snapshot and reflection', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <DailyReflectionModal
        {...baseProps}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByTestId('reflection-textarea'), {
      target: { value: '今天很充实' },
    });
    fireEvent.click(screen.getByTestId('reflection-confirm'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    const call = onConfirm.mock.calls[0]![0] as {
      date: string;
      reflection: string;
      snapshot: {
        completedTasks: Array<{ id: string; title: string; tags?: string[] }>;
        inProgressTasks: Array<{ id: string; title: string; progress?: string }>;
        postponedTasks: Array<{ id: string; title: string; reason?: string }>;
      };
    };
    expect(call.date).toBe('2026-08-20');
    expect(call.reflection).toBe('今天很充实');
    expect(call.snapshot.completedTasks).toEqual([
      { id: 'c1', title: '发布 v2.0', tags: ['launch', 'work'] },
    ]);
    expect(call.snapshot.inProgressTasks).toEqual([
      { id: 'p1', title: '整合反馈', progress: '已收集 12 条' },
    ]);
    expect(call.snapshot.postponedTasks).toEqual([
      { id: 'w1', title: '迁库', reason: '等运维' },
    ]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel button calls onClose without firing onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <DailyReflectionModal
        {...baseProps}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
