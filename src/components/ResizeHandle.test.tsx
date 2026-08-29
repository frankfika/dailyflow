import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

describe('ResizeHandle', () => {
  it('reports pointer deltas while dragging', () => {
    const onResize = vi.fn();
    render(<ResizeHandle label="Resize pane" value={300} min={200} max={500} defaultValue={300} onResize={onResize} testId="handle" />);
    const handle = screen.getByTestId('handle');

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 340 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 325 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 325 });

    expect(onResize).toHaveBeenNthCalledWith(1, 40);
    expect(onResize).toHaveBeenNthCalledWith(2, -15);
    expect(handle).toHaveAttribute('data-dragging', 'false');
  });

  it('supports keyboard adjustment and double-click reset', () => {
    const onResize = vi.fn();
    render(<ResizeHandle label="Resize pane" value={340} min={200} max={500} defaultValue={300} onResize={onResize} testId="handle" />);
    const handle = screen.getByTestId('handle');

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    fireEvent.doubleClick(handle);

    expect(onResize).toHaveBeenNthCalledWith(1, -8);
    expect(onResize).toHaveBeenNthCalledWith(2, 32);
    expect(onResize).toHaveBeenNthCalledWith(3, -40);
  });
});
