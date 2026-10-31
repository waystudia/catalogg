import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode, type SetStateAction, type Dispatch } from 'react';
import { getNavigationScope } from './navigationScope';
import { useLocation, useNavigate, useNavigationType, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom';

type Views = Record<string, unknown>;
type Entry = { key: string; path: string; y: number; scrollers?: Record<string, { top: number; left: number }>; views?: Views };
type Journal = { entries: Entry[]; index: number; scope?: string | null; principal?: string };
const storageKey = 'wayyaam:client-navigation:v1';
type BackContextValue = {
  back: () => boolean; restoring: boolean;
  fallback: (action: () => void) => void;
  takePendingState: (to: To, state: unknown) => unknown;
  bindPrincipal: (identity: string) => void;
  read: (name: string) => unknown;
  capture: (name: string, value: unknown) => void;
  snapshot: (name: string, initial: unknown, update: (current: unknown) => unknown) => boolean;
  change: (name: string, initial: unknown, update: (current: unknown) => unknown, replace?: boolean) => void;
};
const BackContext = createContext<BackContextValue | null>(null);
const viewStateKey = 'wayyaamViews';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function readJournal(key: string, path: string): Journal {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Journal | null;
    if (value && Array.isArray(value.entries) && value.entries.length <= 100 && value.entries.every(e => typeof e.key === 'string' && typeof e.path === 'string' && getNavigationScope(e.path) !== null && Number.isFinite(e.y))) {
      const index = value.entries.findIndex(e => e.key === key && e.path === path);
      if (index >= 0) return { entries: value.entries, index, scope: value.scope ?? getNavigationScope(value.entries[index].path), principal: value.principal };
    }
  } catch { /* Private storage must never prevent navigation. */ }
  return { entries: [], index: -1 };
}

/** One journal entry per real router history entry; no fixed parent or shared returnTo. */
export function ExactBackProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [, invalidate] = useState(0);
  const revision = useRef(0);
  const renderedRevision = revision.current;
  const requestedPrincipal = useRef<{ scope: string | null; identity: string } | null>(null);
  const journal = useRef<Journal>({ entries: [], index: -1 });
  const hydrated = useRef(false);
  if (!hydrated.current) { journal.current = readJournal(location.key, location.pathname + location.search + location.hash); hydrated.current = true; }
  const currentKey = useRef<string | null>(null);
  const snapshots = useRef<Record<string, Views>>({});
  const fallbackDepth = useRef(0);
  const pending = useRef<{ key: string; values: Views; replace: boolean } | null>(null);
  const liveLocation = useRef(location);
  liveLocation.current = location;
  const knownEntry = journal.current.entries.find(e => e.key === location.key);
  const scope = getNavigationScope(location.pathname, journal.current.scope ?? undefined);
  const restoring = action === 'POP' && Boolean(knownEntry) && scope === journal.current.scope;
  const views = useCallback(() => {
    const state = location.state as Record<string, unknown> | null;
    const trustedState = !journal.current.principal || state?.wayyaamPrincipal === journal.current.principal;
    return snapshots.current[location.key] ??= { ...(trustedState ? state?.[viewStateKey] as Views | undefined : {}), ...journal.current.entries.find(e => e.key === location.key)?.views };
  }, [location.key, location.state]);

  useLayoutEffect(() => {
    const path = location.pathname + location.search + location.hash;
    const j = journal.current;
    const save = () => {
      const retained = new Set(j.entries.map(entry => entry.key));
      for (const key of Object.keys(snapshots.current)) if (!retained.has(key)) delete snapshots.current[key];
      for (const entry of j.entries) entry.views = snapshots.current[entry.key] ?? entry.views;
      try { sessionStorage.setItem(storageKey, JSON.stringify(j)); } catch { /* Memory-only fallback. */ }
    };
    if (scope !== j.scope || scope === null) {
      j.entries = []; j.index = -1;
      snapshots.current = { [location.key]: views() };
      j.scope = scope;
      j.principal = requestedPrincipal.current?.scope === scope ? requestedPrincipal.current.identity : undefined;
    }
    if (scope !== null && (currentKey.current !== location.key || j.index < 0)) {
      const existing = j.entries.findIndex(e => e.key === location.key && e.path === path);
      if (action === 'POP') {
        if (existing >= 0) j.index = existing;
        else { j.entries = [{ key: location.key, path, y: 0 }]; j.index = 0; }
      } else {
        const keep = action === 'REPLACE' ? j.index : j.index + 1;
        j.entries = [...j.entries.slice(0, Math.max(0, keep)), { key: location.key, path, y: action === 'REPLACE' ? j.entries[j.index]?.y ?? 0 : 0, scrollers: action === 'REPLACE' ? j.entries[j.index]?.scrollers : undefined }].slice(-100);
        j.index = j.entries.length - 1;
      }
    }
    currentKey.current = location.key;
    save();
    if (scope === null) return;
    let frame = 0;
    let restoringScroll = true;
    const preservePosition = restoring || (action === 'REPLACE' && (location.state as { wayyaamPreserveScroll?: boolean } | null)?.wayyaamPreserveScroll === true);
    const explicitY = (location.state as { restoreScrollY?: unknown } | null)?.restoreScrollY;
    const target = preservePosition ? j.entries[j.index]?.y ?? 0 : typeof explicitY === 'number' && Number.isFinite(explicitY) ? Math.max(0, explicitY) : 0;
    const search = new URLSearchParams(location.search);
    const targeted = !restoring && (search.has('focusDish') || search.has('focusDishTitle'));
    const scrollers = preservePosition ? j.entries[j.index]?.scrollers ?? {} : {};
    let retry: number | undefined;
    const deadline = Date.now() + 10_000;
    let settledFrames = 0;
    let previousHeight = -1;
    const restore = () => {
      window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      let pendingScroll = Math.abs(window.scrollY - target) > 2;
      for (const element of document.querySelectorAll<HTMLElement>('[data-navigation-scroll]')) {
        const position = scrollers[element.dataset.navigationScroll ?? ''] ?? { top: 0, left: 0 };
        element.scrollTo({ top: position.top, left: position.left, behavior: 'instant' });
        pendingScroll ||= Math.abs(element.scrollTop - position.top) > 2 || Math.abs(element.scrollLeft - position.left) > 2;
      }
      const height = document.documentElement.scrollHeight;
      settledFrames = !pendingScroll && height === previousHeight ? settledFrames + 1 : 0;
      previousHeight = height;
      if (pendingScroll && Date.now() < deadline) retry = window.setTimeout(() => { frame = requestAnimationFrame(restore); }, 100);
      else if (!pendingScroll && settledFrames < 3) frame = requestAnimationFrame(restore);
      else restoringScroll = false;
    };
    if (targeted) restoringScroll = false;
    else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(restore); });
    const record = () => {
      if (restoringScroll || !j.entries[j.index]) return;
      const entry = j.entries[j.index];
      entry.y = window.scrollY;
      entry.scrollers = Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-navigation-scroll]')].map(element => [element.dataset.navigationScroll ?? '', { top: element.scrollTop, left: element.scrollLeft }]));
    };
    const interrupt = () => { cancelAnimationFrame(frame); window.clearTimeout(retry); restoringScroll = false; };
    const checkpoint = () => { record(); save(); };
    document.addEventListener('scroll', record, true);
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('click', checkpoint, true);
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(retry);
      save();
      document.removeEventListener('scroll', record, true);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('click', checkpoint, true);
    };
  }, [location.key, location.pathname, location.search, location.hash, location.state, action, restoring, scope, views]);

  return <BackContext.Provider value={{ restoring,
    bindPrincipal: identity => {
      requestedPrincipal.current = { scope, identity };
      const j = journal.current;
      if (j.scope !== scope || j.principal === identity) return;
      if (j.principal) {
        j.entries = [{ key: location.key, path: location.pathname + location.search, y: 0, views: {} }]; j.index = 0;
        snapshots.current = { [location.key]: {} };
        pending.current = null;
        revision.current += 1;
      }
      j.principal = identity;
      try { sessionStorage.setItem(storageKey, JSON.stringify(j)); } catch { /* memory fallback */ }
      invalidate(n => n + 1);
    },
    fallback: action => { fallbackDepth.current += 1; try { action(); } finally { fallbackDepth.current -= 1; } },
    takePendingState: (to, state) => {
      const target = pending.current;
      if (!target || target.key !== location.key) return state;
      pending.current = null;
      const path = typeof to === 'string' ? to.split(/[?#]/)[0] : to.pathname ?? location.pathname;
      if (getNavigationScope(path, scope ?? undefined) !== scope) return state;
      return { ...(state && typeof state === 'object' ? state : {}), [viewStateKey]: target.values, wayyaamPrincipal: journal.current.principal };
    },
    read: name => views()[name],
    capture: (name, value) => { if (renderedRevision !== revision.current) return; if (!(name in views())) views()[name] = value; },
    snapshot: (name, initial, update) => {
      if (renderedRevision !== revision.current) return false;
      const current = name in views() ? views()[name] : initial;
      const next = update(current);
      if (equal(current, next)) return false;
      views()[name] = next;
      return true;
    },
    change: (name, initial, update, replace = false) => {
      if (renderedRevision !== revision.current) return;
      const queued = pending.current?.key === location.key ? pending.current : null;
      const values = queued?.key === location.key ? queued.values : { ...views() };
      const current = name in values ? values[name] : initial;
      const next = update(current);
      if (equal(current, next)) return;
      values[name] = next;
      pending.current = { key: location.key, values, replace: fallbackDepth.current > 0 ? true : queued?.replace === false ? false : replace };
      if (queued?.key === location.key) return;
      queueMicrotask(() => {
        const target = pending.current;
        if (!target || target.key !== location.key) return;
        pending.current = null;
        if (liveLocation.current.key !== target.key) return;
        navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: target.replace, state: { ...location.state, [viewStateKey]: target.values, wayyaamPrincipal: journal.current.principal, wayyaamPreserveScroll: target.replace } });
      });
    }, back: () => {
    const j = journal.current;
    if (j.index <= 0 || j.entries[j.index]?.key !== location.key || scope === null) return false;
    pending.current = null;
    navigate(-1);
    return true;
  } }}>{children}</BackContext.Provider>;
}

export function useExactBack(fallback: string | (() => void)) {
  const context = useContext(BackContext);
  const navigate = useNavigate();
  return () => {
    if (context?.back()) return;
    if (typeof fallback === 'function') { if (context) context.fallback(fallback); else fallback(); }
    else navigate(fallback, { replace: true });
  };
}
export const useIsHistoryRestoration = () => useContext(BackContext)?.restoring ?? false;

/** Record a local screen/tab/modal as a genuine history step, batching related setters. */
export function useHistoryViewState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>, Dispatch<SetStateAction<T>>] {
  const context = useContext(BackContext);
  const [fallback, setFallback] = useState(initial);
  const defaultValue = typeof initial === 'function' ? (initial as () => T)() : initial;
  const remembered = context?.read(name);
  const value = context ? (remembered === undefined ? defaultValue : remembered) as T : fallback;
  useLayoutEffect(() => { context?.capture(name, value); });
  const live = useRef({ context, defaultValue });
  live.current = { context, defaultValue };
  const change = useCallback((update: SetStateAction<T>, replace: boolean) => {
    const latest = live.current;
    if (!latest.context) { setFallback(update); return; }
    latest.context.change(name, latest.defaultValue, current => typeof update === 'function' ? (update as (current: T) => T)(current as T) : update, replace);
  }, [name]);
  const push = useCallback((update: SetStateAction<T>) => change(update, false), [change]);
  const replace = useCallback((update: SetStateAction<T>) => change(update, true), [change]);
  return [value, push, replace];
}

export function useBackAction(fallback: () => void) {
  const context = useContext(BackContext);
  return () => { if (!context?.back()) { if (context) context.fallback(fallback); else fallback(); } };
}

/** Call only with the identity verified by the surrounding role gate, never with form input. */
export function useNavigationPrincipal(identity: string | null | undefined) {
  const context = useContext(BackContext);
  useLayoutEffect(() => { if (identity) context?.bindPrincipal(identity); }, [context, identity]);
}

/** Filters, anchored categories and draft UI are snapshots, not extra Back steps. */
export function useEntrySnapshotState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(BackContext);
  const [local, setLocal] = useState(initial);
  const [, invalidate] = useState(0);
  const defaultValue = typeof initial === 'function' ? (initial as () => T)() : initial;
  const remembered = context?.read(name);
  const value = context ? (remembered === undefined ? defaultValue : remembered) as T : local;
  useLayoutEffect(() => { context?.capture(name, value); });
  const live = useRef({ context, defaultValue }); live.current = { context, defaultValue };
  const set = useCallback((update: SetStateAction<T>) => {
    const latest = live.current;
    if (!latest.context) { setLocal(update); return; }
    const changed = latest.context.snapshot(name, latest.defaultValue, current => typeof update === 'function' ? (update as (current: T) => T)(current as T) : update);
    if (changed) invalidate(n => n + 1);
  }, [name]);
  return [value, set];
}

/** Commit pending local UI changes together with a route/query transition, without an extra history step. */
export function useViewNavigate(): NavigateFunction {
  const context = useContext(BackContext);
  const navigate = useNavigate();
  return ((to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') navigate(to);
    else navigate(to, { ...options, state: context?.takePendingState(to, options?.state) ?? options?.state });
  }) as NavigateFunction;
}
