export type SupabaseAuthScope = 'client' | 'driver' | 'restaurant-admin' | 'platform-admin' | 'login';

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
  if (segments[0] === 'restaurant' && segments[1] === 'activation') return 'restaurant-admin';
  if (segments[0] === 'login') return 'login';
  if (clientRoots.has(segments[0] ?? '')) return 'client';
  if (segments[0] === 'scanner' || restaurantAdminSections.has(segments[1] ?? '')) {
    return 'restaurant-admin';
  }

  return 'client';
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
    const targetKey = getSupabaseAuthStorageKey(scope);
    const session =
      serializedSession ??
      getSupabaseAuthFallbackStorageKeys(scope)
        .map((key) => window.localStorage.getItem(key))
        .find(Boolean);
    if (session) window.localStorage.setItem(targetKey, session);
  } catch {
    // Supabase will keep using the in-memory session if storage is unavailable.
  }
};

export const handoffSupabaseSessionToScope = (
  scope: SupabaseAuthScope,
  serializedSession?: string | null
) => {
  if (typeof window === 'undefined') return;
  try {
    const targetKey = getSupabaseAuthStorageKey(scope);
    const sourceKeys = getSupabaseAuthFallbackStorageKeys(scope);
    const session =
      serializedSession ??
      sourceKeys
        .map((key) => window.localStorage.getItem(key))
        .find(Boolean);
    if (!session) return;

    window.localStorage.setItem(targetKey, session);
    sourceKeys
      .filter((key) => key !== targetKey)
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // The authenticated client keeps its in-memory session until navigation completes.
  }
};
