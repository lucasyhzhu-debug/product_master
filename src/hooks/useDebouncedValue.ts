import { useEffect, useState } from "react";

/**
 * Debounce a rapidly changing value. The returned value updates only after
 * `delayMs` of no further changes — matches lodash.debounce semantics for
 * state-driven values.
 *
 * Used by the financial-export preflight subscription to avoid firing a Convex
 * useQuery on every keystroke in a date input. NOTE: React's `useDeferredValue`
 * defers RENDERING, not state changes — it does not provide a guaranteed
 * minimum debounce delay, so we use a real `setTimeout`-based debounce here.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
