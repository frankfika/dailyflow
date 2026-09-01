import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DatePickerPopover } from '../../components/DatePickerPopover';

afterEach(cleanup);

describe('DatePickerPopover (UX_DESIGN §1.2)', () => {
  const TODAY = '2026-09-01';
  const base = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    today: TODAY,
    language: 'zh' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<DatePickerPopover open={false} currentDate={TODAY} {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current month grid and highlights today', () => {
    render(<DatePickerPopover open currentDate={TODAY} {...base} />);
    expect(screen.getByTestId('date-picker-popover')).toBeVisible();
    // September 2026 starts on a Tuesday — 1 pad cell (Monday first)
    expect(screen.getByTestId('date-picker-day-2026-09-01')).toHaveTextContent('1');
    expect(screen.getByTestId('date-picker-today')).toBeVisible();
  });

  it('disables future dates', () => {
    render(<DatePickerPopover open currentDate={TODAY} {...base} />);
    expect(screen.getByTestId('date-picker-day-2026-09-05')).toBeDisabled();
  });

  it('selects a past date via onSelect and closes via onSelect(today) for back-to-today', () => {
    const onSelect = vi.fn();
    render(<DatePickerPopover open currentDate={TODAY} {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('date-picker-prev-month'));
    fireEvent.click(screen.getByTestId('date-picker-day-2026-08-15'));
    expect(onSelect).toHaveBeenCalledWith('2026-08-15');

    fireEvent.click(screen.getByTestId('date-picker-today'));
    expect(onSelect).toHaveBeenLastCalledWith(TODAY);
  });

  it('navigates months and blocks navigation into the future', () => {
    render(<DatePickerPopover open currentDate={TODAY} {...base} />);
    // today is 2026-09-01 → next month entirely future → next nav disabled
    expect(screen.getByTestId('date-picker-next-month')).toBeDisabled();
    fireEvent.click(screen.getByTestId('date-picker-prev-month'));
    expect(screen.getByTestId('date-picker-day-2026-08-15')).toBeVisible();
    expect(screen.queryByTestId('date-picker-day-2026-09-01')).toBeNull();
    fireEvent.click(screen.getByTestId('date-picker-next-month'));
    expect(screen.getByTestId('date-picker-day-2026-09-01')).toBeVisible();
  });
});
