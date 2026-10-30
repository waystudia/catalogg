import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

type Entry = { key: string; path: string; y: number };
type Journal = { entries: Entry[]; index: number };
const storageKey = 'wayyaam:client-navigation:v1';
const BackContext = createContext<{ back: () => boolean; restoring: boolean } | null>(null);
const isClientPath = (path: string) => path.startsWith('/') && !path.startsWith('//') && !/^\/(?:admin|driver|login|scanner|registration-preview|restaurant)(?:\/|$)/.test(path) && !/^\/(?!profile(?:\/|$))[^/]+\/(?:admin|settings|scanner|dashboard|orders|dishes|finance|payments)(?:\/|$)/.test(path);

function readJournal(key: string): Journal {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Journal | null;
    if (value && Array.isArray(value.entries) && value.entries.length <= 100 && value.entries.every(e => typeof e.key === 'string' && typeof e.path === 'string' && isClientPath(e.path) && Number.isFinite(e.y))) {
      const index = value.entries.findIndex(e => e.key === key);
      if (index >= 0) return { entries: value.entries, index };
    }
  } catch { /* Private storage must never prevent navigation. */ }
  return { entries: [], index: -1 };
}

/** One journal entry per real router history entry; no fixed parent or shared returnTo. */
export function ExactBackProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const journal = useRef<Journal>({ entries: [], index: -1 });
  const hydrated = useRef(false);
  if (!hydrated.current) { journal.current = readJournal(location.key); hydrated.current = true; }
  const currentKey = useRef<string | null>(null);
  const knownEntry = journal.current.entries.find(e => e.key === location.key);
  const restoring = action === 'POP' && Boolean(knownEntry);

  useLayoutEffect(() => {
    const path = location.pathname + location.search + location.hash;
    const j = journal.current;
    const save = () => {
      try { sessionStorage.setItem(storageKey, JSON.stringify(j)); } catch { /* Memory-only fallback. */ }
    };
    if (!isClientPath(location.pathname)) {
      j.entries = []; j.index = -1;
    } else if (currentKey.current !== location.key) {
      const existing = j.entries.findIndex(e => e.key === location.key);
      if (action === 'POP' && existing >= 0) j.index = existing;
      else {
        const keep = action === 'REPLACE' ? j.index : j.index + 1;
        j.entries = [...j.entries.slice(0, Math.max(0, keep)), { key: location.key, path, y: action === 'REPLACE' ? j.entries[j.index]?.y ?? 0 : 0 }].slice(-100);
        j.index = j.entries.length - 1;
      }
    }
    currentKey.current = location.key;
    save();
    if (!isClientPath(location.pathname)) return;
    let frame = 0;
    let restoringScroll = true;
    const explicitY = (location.state as { restoreScrollY?: unknown } | null)?.restoreScrollY;
    const target = restoring ? j.entries[j.index]?.y ?? 0 : typeof explicitY === 'number' && Number.isFinite(explicitY) ? Math.max(0, explicitY) : 0;
    const search = new URLSearchParams(location.search);
    const targeted = !restoring && (search.has('focusDish') || search.has('focusDishTitle'));
    let attempts = 0;
    const restore = () => {
      window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      if (Math.abs(window.scrollY - target) > 2 && ++attempts < 60) frame = requestAnimationFrame(restore);
      else restoringScroll = false;
    };
    if (targeted) restoringScroll = false;
    else frame = requestAnimationFrame(() => { frame = requestAnimationFrame(restore); });
    const record = () => {
      if (restoringScroll || !j.entries[j.index]) return;
      j.entries[j.index].y = window.scrollY;
      save();
    };
    const interrupt = () => { cancelAnimationFrame(frame); restoringScroll = false; };
    window.addEventListener('scroll', record, { passive: true });
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pagehide', record);
    document.addEventListener('click', record, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', record);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pagehide', record);
      document.removeEventListener('click', record, true);
    };
  }, [location.key, location.pathname, location.search, location.hash, location.state, action, restoring]);

  return <BackContext.Provider value={{ restoring, back: () => {
    const j = journal.current;
    if (j.index <= 0 || j.entries[j.index]?.key !== location.key || !isClientPath(location.pathname)) return false;
    navigate(-1);
    return true;
  } }}>{children}</BackContext.Provider>;
}

export function useExactBack(fallback: string | (() => void)) {
  const context = useContext(BackContext);
  const navigate = useNavigate();
  return () => {
    if (context?.back()) return;
    if (typeof fallback === 'function') fallback();
    else navigate(fallback, { replace: true });
  };
}
export const useIsHistoryRestoration = () => useContext(BackContext)?.restoring ?? false;
