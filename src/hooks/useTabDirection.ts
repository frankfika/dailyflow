/**
 * useTabDirection — derive a horizontal slide direction (1 = forward,
 * -1 = back) from a sequence of tab changes, so page transitions can
 * mirror the user's mental "stack" of pages.
 *
 * The order map is owned by the consumer (App.tsx exports a shared
 * `TAB_ORDER` so other components can render directional transitions
 * too); this hook only reacts to the active tab value and emits the
 * delta between the previous and current index. Returning `0` means
 * "no directional preference" (first render, same tab, or unknown
 * tab) — page-level Motion components should fall back to a pure
 * fade in that case.
 *
 * Why this matters: the existing implementation fades + translates
 * every new page from `y: 8`, so swapping Today → Notes feels like a
 * modal opening. With direction-aware slides, going to a "later" tab
 * slides the new page in from the right while the old one exits to the
 * left — matching native iOS / Android tab-switch behavior.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Returns the horizontal slide direction for a tab change:
 *  - `1`  : new tab is later in the sequence → slide from the right
 *  - `-1` : new tab is earlier in the sequence → slide from the left
 *  - `0`  : same tab, unknown tab, or first render → fade only
 *
 * The result updates synchronously inside an effect so the consumer's
 * transition `key` can use the direction value (no flicker on first
 * paint).
 */
export function useTabDirection<T extends string>(
  activeTab: T,
  order: ReadonlyArray<T>,
): -1 | 0 | 1 {
  const previousTabRef = useRef<T | null>(null);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);

  useEffect(() => {
    const previous = previousTabRef.current;
    previousTabRef.current = activeTab;
    if (previous === null || previous === activeTab) {
      setDirection(0);
      return;
    }
    const fromIndex = order.indexOf(previous);
    const toIndex = order.indexOf(activeTab);
    if (fromIndex === -1 || toIndex === -1) {
      // Unknown transition (e.g. tab renamed or removed from the
      // ordering). Don't pick a direction — let the page fade.
      setDirection(0);
      return;
    }
    setDirection(toIndex > fromIndex ? 1 : -1);
  }, [activeTab, order]);

  return direction;
}
