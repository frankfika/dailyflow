import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlashMenu } from './SlashMenu';

describe('SlashMenu', () => {
  it('renders all 6 kind options and fires onPick on click', () => {
    const onPick = vi.fn();
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      <SlashMenu anchor={{ x: 100, y: 100 }} language="en" onPick={onPick} onDismiss={onDismiss} />,
    );
    expect(getByTestId('slash-menu')).toBeInTheDocument();
    for (const kind of ['task', 'question', 'branch', 'tag', 'resource', 'risk']) {
      expect(getByTestId(`slash-menu-option-${kind}`)).toBeInTheDocument();
    }
    fireEvent.click(getByTestId('slash-menu-option-risk'));
    expect(onPick).toHaveBeenCalledWith('risk');
  });

  it('excludes the listed kinds', () => {
    const { queryByTestId } = render(
      <SlashMenu anchor={{ x: 0, y: 0 }} language="en" onPick={() => {}} onDismiss={() => {}} exclude={['task', 'risk']} />,
    );
    expect(queryByTestId('slash-menu-option-task')).toBeNull();
    expect(queryByTestId('slash-menu-option-risk')).toBeNull();
    expect(queryByTestId('slash-menu-option-question')).toBeInTheDocument();
  });

  it('ArrowDown / Enter picks the next option', () => {
    const onPick = vi.fn();
    render(
      <SlashMenu anchor={{ x: 0, y: 0 }} language="en" onPick={onPick} onDismiss={() => {}} />,
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // OPTIONS order is [task, question, branch, tag, resource, risk].
    // ArrowDown from index 0 → index 1 → 'question'.
    expect(onPick).toHaveBeenCalledWith('question');
  });

  it('ArrowUp / Enter picks the previous (clamped to 0)', () => {
    const onPick = vi.fn();
    render(
      <SlashMenu anchor={{ x: 0, y: 0 }} language="en" onPick={onPick} onDismiss={() => {}} />,
    );
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // Clamped to 0 → 'task'.
    expect(onPick).toHaveBeenCalledWith('task');
  });

  it('Escape fires onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <SlashMenu anchor={{ x: 0, y: 0 }} language="en" onPick={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});