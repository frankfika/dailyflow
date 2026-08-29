import { useEffect, useRef, useState } from 'react';

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  className?: string;
  testId?: string;
}

/**
 * A wide-hit-target, visually subtle vertical separator. Pointer movement is
 * reported as deltas so the owning pane remains responsible for clamping and
 * persistence. The separator is also keyboard adjustable for accessibility.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  defaultValue,
  onResize,
  onResizeStart,
  onResizeEnd,
  className = '',
  testId,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  const previousBodyCursorRef = useRef('');
  const previousUserSelectRef = useRef('');

  onResizeRef.current = onResize;
  onResizeEndRef.current = onResizeEnd;

  // Listen on window instead of relying solely on pointer capture. This keeps
  // a fast drag alive after the pointer leaves the narrow separator hit area.
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const delta = event.clientX - lastXRef.current;
      if (delta === 0) return;
      lastXRef.current = event.clientX;
      onResizeRef.current(delta);
    };
    const handleEnd = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      onResizeEndRef.current?.();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    previousBodyCursorRef.current = document.body.style.cursor;
    previousUserSelectRef.current = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = previousBodyCursorRef.current;
      document.body.style.userSelect = previousUserSelectRef.current;
    };
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      data-testid={testId}
      data-dragging={dragging}
      className={`group absolute inset-y-0 right-0 z-30 w-2 translate-x-1/2 cursor-col-resize touch-none outline-none ${className}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        lastXRef.current = event.clientX;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        draggingRef.current = true;
        setDragging(true);
        onResizeStart?.();
      }}
      onDoubleClick={() => onResize(defaultValue - value)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.shiftKey ? 32 : 8;
        onResize(event.key === 'ArrowLeft' ? -step : step);
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-accent/60 group-focus-visible:w-0.5 group-focus-visible:bg-accent group-data-[dragging=true]:w-0.5 group-data-[dragging=true]:bg-accent" />
    </div>
  );
}
