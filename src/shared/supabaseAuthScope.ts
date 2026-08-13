export type SupabaseAuthScope = 'client' | 'driver' | 'restaurant-admin' | 'platform-admin' | 'login';

type SupabaseAuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memoryAuthStorage = new Map<string, string>();

const browserAuthStorageNames = ['localStorage', 'sessionStorage'] as const;
const sessionFallbackMarkerPrefix = 'waycatalog-auth-session-fallback:';

const getSessionFallbackMarkerKey = (key: string) => `${sessionFallbackMarkerPrefix}${key}`;

const getBrowserAuthStorage = (name: (typeof browserAuthStorageNames)[number]): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window[name];
  } catch {
    return null;
  }
};

const supabaseAuthStorage: SupabaseAuthStorage = {
  getItem(key) {
    const memoryValue = memoryAuthStorage.get(key);
    if (memoryValue !== undefined) return memoryValue;

    const sessionStorage = getBrowserAuthStorage('sessionStorage');
    if (sessionStorage) {
      try {
        const markerKey = getSessionFallbackMarkerKey(key);
        if (sessionStorage.getItem(markerKey) === '1') {
          const fallbackValue = sessionStorage.getItem(key);
          if (fallbackValue !== null) return fallbackValue;
          sessionStorage.removeItem(markerKey);
        }
      } catch {
        // Continue with the durable store when the tab fallback is unavailable.
      }
    }

    for (const name of browserAuthStorageNames) {
      const storage = getBrowserAuthStorage(name);
      if (!storage) continue;
      try {
        const value = storage.getItem(key);
        if (value !== null) return value;
      } catch {
        // Try the next browser storage when Safari blocks this one.
      }
    }
    return memoryAuthStorage.get(key) ?? null;
  },
  setItem(key, value) {
    for (const [index, name] of browserAuthStorageNames.entries()) {
      const storage = getBrowserAuthStorage(name);
      if (!storage) continue;
      try {
        storage.setItem(key, value);
        if (name === 'sessionStorage') {
          storage.setItem(getSessionFallbackMarkerKey(key), '1');
        }
        browserAuthStorageNames.slice(index + 1).forEach((fallbackName) => {
          try {
            const fallbackStorage = getBrowserAuthStorage(fallbackName);
            fallbackStorage?.removeItem(key);
            fallbackStorage?.removeItem(getSessionFallbackMarkerKey(key));
          } catch {
            // A stale fallback cannot override the successfully written primary value.
          }
        });
        memoryAuthStorage.delete(key);
        return;
      } catch {
        // Try the next browser storage when Safari blocks this one.
      }
    }
    memoryAuthStorage.set(key, value);
  },
  removeItem(key) {
    browserAuthStorageNames.forEach((name) => {
      try {
        const storage = getBrowserAuthStorage(name);
        storage?.removeItem(key);
        storage?.removeItem(getSessionFallbackMarkerKey(key));
      } catch {
        // Continue clearing the other stores even when one is unavailable.
      }
    });
    memoryAuthStorage.delete(key);
  }
};

export const getSupabaseAuthStorage = (): SupabaseAuthStorage => supabaseAuthStorage;

const restaurantAdminSections = new Set([
  'dashboard',
  'dishes',
  'orders',
  'scanner',
  'settings',
  'payments',
  'pos'
]);

const clientRoots = new Set([
  'cart',
  'categories',
  'city',
  'confirm',
  'g',
  'privacy',
  'profile',
  'promo',
  'r',
  'restaurants'
]);

export const getSupabaseAuthScope = (route: string): SupabaseAuthScope => {
  const normalized = route.replace(/^#?\/?/, '').split(/[?#]/, 1)[0];
  const segments = normalized.split('/').filter(Boolean);

  if (segments[0] === 'driver') return 'driver';
  if (segments[0] === 'admin') return 'platform-admin';
  if (segments[0] === 'business' && segments[1]) return 'restaurant-admin';
  if (segments[0] === 'restaurant' && segments[1] === 'activation') return 'restaurant-admin';
  if (segments[0] === 'login') return 'login';
  if (clientRoots.has(segments[0] ?? '')) return 'client';
  if (segments[0] === 'scanner' || restaurantAdminSections.has(segments[1] ?? '')) {
    return 'restaurant-admin';
  }

  return 'client';
};

export const getSupabaseStartupAuthScope = (
  route: string,
  savedResumePath: string | null
): SupabaseAuthScope => {
  const normalizedRoute = route.replace(/^#?\/?/, '').split(/[?#]/, 1)[0];
  if (normalizedRoute) return getSupabaseAuthScope(route);
  return savedResumePath ? getSupabaseAuthScope(savedResumePath) : 'client';
};

export const getSupabaseAuthStorageKey = (scope: SupabaseAuthScope) => `waycatalog-auth-${scope}`;

export const getSupabaseAuthStorageKeyForRedirect = (redirect: string) =>
  getSupabaseAuthStorageKey(getSupabaseAuthScope(redirect));

export const getSupabaseAuthFallbackStorageKeys = (scope: SupabaseAuthScope) => {
  const preferredScopes: readonly SupabaseAuthScope[] = [scope, 'login'];
  return [...new Set(preferredScopes.map(getSupabaseAuthStorageKey)), 'waycatalog-auth'];
};

export const copySupabaseSessionToScope = (scope: SupabaseAuthScope, serializedSession?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    const storage = getSupabaseAuthStorage();
    const targetKey = getSupabaseAuthStorageKey(scope);
    const session =
      serializedSession ??
      getSupabaseAuthFallbackStorageKeys(scope)
        .map((key) => storage.getItem(key))
        .find(Boolean);
    if (session) storage.setItem(targetKey, session);
  } catch {
    // Supabase will keep using the in-memory session if storage is unavailable.
  }
};

export const handoffSupabaseSessionToScope = (
  scope: SupabaseAuthScope,
  serializedSession?: string | null,
  sourceScope?: SupabaseAuthScope
) => {
  if (typeof window === 'undefined') return;
  try {
    const storage = getSupabaseAuthStorage();
    const targetKey = getSupabaseAuthStorageKey(scope);
    const sourceKeys = getSupabaseAuthFallbackStorageKeys(scope);
    const session =
      serializedSession ??
      sourceKeys
        .map((key) => storage.getItem(key))
        .find(Boolean);
    if (!session) return;

    storage.setItem(targetKey, session);
    [...new Set([
      ...sourceKeys,
      ...(sourceScope ? [getSupabaseAuthStorageKey(sourceScope)] : [])
    ])]
      .filter((key) => key !== targetKey)
      .forEach((key) => storage.removeItem(key));
  } catch {
    // The authenticated client keeps its in-memory session until navigation completes.
  }
};
