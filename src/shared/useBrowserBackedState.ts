import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureCurrentScroll, exactHistoryPushEvent, withExactScroll } from './exactScrollState';

const exactBackStateKey = '__wayyaamExactBack';

type ExactBackState = {
  activeScope?: string;
  snapshots?: Record<string, unknown>;
};

type HistoryState = Record<string, unknown> & {
  idx?: number;
  key?: string;
  [exactBackStateKey]?: ExactBackState;
};

type StateUpdater<T> = T | ((current: T) => T);

const asHistoryState = (value: unknown): HistoryState =>
  value && typeof value === 'object' ? value as HistoryState : {};

const readSnapshot = <T,>(state: unknown, scope: string): T | undefined =>
  asHistoryState(state)[exactBackStateKey]?.snapshots?.[scope] as T | undefined;

const resolveUpdater = <T,>(updater: StateUpdater<T>, current: T) =>
  typeof updater === 'function' ? (updater as (value: T) => T)(current) : updater;

const createHistoryKey = () => Math.random().toString(36).slice(2, 10);

const writeSnapshot = <T,>(
  state: unknown,
  scope: string,
  value: T,
  activeScope?: string
): HistoryState => {
  const current = asHistoryState(state);
  const exactBack = current[exactBackStateKey] ?? {};
  return {
    ...current,
    [exactBackStateKey]: {
      ...exactBack,
      activeScope: activeScope ?? exactBack.activeScope,
      snapshots: {
        ...exactBack.snapshots,
        [scope]: value
      }
    }
  };
};

/**
 * Keeps a component-local screen in the real browser history. A forward UI
 * transition gets its own entry, so the visible Back control and browser/OS
 * Back restore the same snapshot in LIFO order without changing the URL.
 */
export function useBrowserBackedState<T>(scope: string, initialValue: T) {
  const initialValueRef = useRef(initialValue);
  const [value, setValue] = useState<T>(() =>
    typeof window === 'undefined'
      ? initialValue
      : readSnapshot<T>(window.history.state, scope) ?? initialValue
  );

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      setValue(readSnapshot<T>(event.state, scope) ?? initialValueRef.current);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [scope]);

  const replace = useCallback((updater: StateUpdater<T>) => {
    setValue((currentValue) => {
      const nextValue = resolveUpdater(updater, currentValue);
      window.history.replaceState(
        writeSnapshot(window.history.state, scope, nextValue),
        '',
        window.location.href
      );
      return nextValue;
    });
  }, [scope]);

  const open = useCallback((updater: StateUpdater<T>) => {
    setValue((currentValue) => {
      const nextValue = resolveUpdater(updater, currentValue);
      captureCurrentScroll();
      const sourceState = writeSnapshot(window.history.state, scope, currentValue);
      window.history.replaceState(sourceState, '', window.location.href);
      window.history.pushState(
        {
          ...withExactScroll(writeSnapshot(sourceState, scope, nextValue, scope), { x: 0, y: 0 }),
          idx: typeof sourceState.idx === 'number' ? sourceState.idx + 1 : sourceState.idx,
          key: createHistoryKey()
        },
        '',
        window.location.href
      );
      window.dispatchEvent(new Event(exactHistoryPushEvent));
      return nextValue;
    });
  }, [scope]);

  const back = useCallback((fallback?: () => void) => {
    const current = asHistoryState(window.history.state);
    if (current[exactBackStateKey]?.activeScope === scope) {
      window.history.back();
      return;
    }
    if (fallback) {
      fallback();
      return;
    }
    replace(initialValueRef.current);
  }, [replace, scope]);

  const history = useMemo(() => ({ open, replace, back }), [back, open, replace]);
  return [value, history] as const;
}

export const hasBrowserBackedOrigin = (state: unknown, scope: string) =>
  asHistoryState(state)[exactBackStateKey]?.activeScope === scope;
