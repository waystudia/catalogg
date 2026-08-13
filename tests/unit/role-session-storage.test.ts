import { describe, expect, it } from 'vitest';
import {
  getSupabaseAuthStorage,
  handoffSupabaseSessionToScope
} from '../../src/shared/supabaseAuthScope';

type StorageValues = Map<string, string>;

const memoryStorage = (values: StorageValues): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => ({
  getItem: (key) => values.get(key) ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value)
});

const blockedStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => ({
  getItem: () => {
    throw new DOMException('Blocked', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('Blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('Blocked', 'SecurityError');
  }
});

const withWindowStorage = (
  localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  run: () => void
) => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, sessionStorage }
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow
    });
  }
};

describe('role session browser storage', () => {
  it('uses durable localStorage first and removes an older tab-only fallback', () => {
    const localValues = new Map<string, string>([['role-key', 'durable-session']]);
    const tabValues = new Map<string, string>([['role-key', 'stale-tab-session']]);

    withWindowStorage(memoryStorage(localValues), memoryStorage(tabValues), () => {
      const storage = getSupabaseAuthStorage();
      expect(storage.getItem('role-key')).toBe('durable-session');

      storage.setItem('role-key', 'refreshed-session');
      expect(storage.getItem('role-key')).toBe('refreshed-session');
    });

    expect(localValues.get('role-key')).toBe('refreshed-session');
    expect(tabValues.has('role-key')).toBe(false);
  });

  it('moves a completed Finik login through sessionStorage when Safari blocks localStorage', () => {
    const tabValues = new Map<string, string>([
      ['waycatalog-auth-client', 'stale-client-session'],
      ['waycatalog-auth-driver', 'independent-driver-session']
    ]);

    withWindowStorage(blockedStorage(), memoryStorage(tabValues), () => {
      handoffSupabaseSessionToScope('restaurant-admin', 'fresh-finik-session', 'client');

      expect(getSupabaseAuthStorage().getItem('waycatalog-auth-restaurant-admin')).toBe(
        'fresh-finik-session'
      );
    });

    expect(tabValues.get('waycatalog-auth-restaurant-admin')).toBe('fresh-finik-session');
    expect(tabValues.has('waycatalog-auth-client')).toBe(false);
    expect(tabValues.get('waycatalog-auth-driver')).toBe('independent-driver-session');
  });

  it('reads the tab fallback when localStorage is available but has no role session', () => {
    const localValues = new Map<string, string>();
    const tabValues = new Map<string, string>([['role-key', 'tab-session']]);

    withWindowStorage(memoryStorage(localValues), memoryStorage(tabValues), () => {
      expect(getSupabaseAuthStorage().getItem('role-key')).toBe('tab-session');
    });
  });

  it('uses the tab fallback when Safari throws while exposing localStorage', () => {
    const tabValues = new Map<string, string>();
    const previousWindow = globalThis.window;
    const safariWindow = { sessionStorage: memoryStorage(tabValues) } as Record<string, unknown>;
    Object.defineProperty(safariWindow, 'localStorage', {
      get: () => {
        throw new DOMException('Blocked', 'SecurityError');
      }
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: safariWindow
    });

    try {
      const storage = getSupabaseAuthStorage();
      storage.setItem('role-key', 'tab-session');
      expect(storage.getItem('role-key')).toBe('tab-session');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    expect(tabValues.get('role-key')).toBe('tab-session');
  });

  it('keeps the active session in memory when both browser stores are unavailable', () => {
    const storageKey = 'waycatalog-auth-test-memory-only';

    withWindowStorage(undefined, undefined, () => {
      const storage = getSupabaseAuthStorage();
      storage.setItem(storageKey, 'same-document-session');
      expect(storage.getItem(storageKey)).toBe('same-document-session');

      storage.removeItem(storageKey);
      expect(storage.getItem(storageKey)).toBeNull();
    });
  });

  it('keeps the same-document fallback usable before a browser window exists', () => {
    const storageKey = 'waycatalog-auth-test-server-memory';
    const previousWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, 'window');

    try {
      const storage = getSupabaseAuthStorage();
      storage.setItem(storageKey, 'pre-window-session');
      expect(storage.getItem(storageKey)).toBe('pre-window-session');
      storage.removeItem(storageKey);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }
  });

  it('clears the role session from every available browser store', () => {
    const localValues = new Map<string, string>([['role-key', 'local-session']]);
    const tabValues = new Map<string, string>([['role-key', 'tab-session']]);

    withWindowStorage(memoryStorage(localValues), memoryStorage(tabValues), () => {
      const storage = getSupabaseAuthStorage();
      storage.removeItem('role-key');
      expect(storage.getItem('role-key')).toBeNull();
    });

    expect(localValues.has('role-key')).toBe(false);
    expect(tabValues.has('role-key')).toBe(false);
  });
});
