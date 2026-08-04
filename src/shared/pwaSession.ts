const pwaResumePathKey = 'waycatalog:pwa-resume-path';

export type RestaurantAdminTab = 'home' | 'dishes' | 'orders' | 'settings' | 'scanner' | 'pos';

const isBrowser = () => typeof window !== 'undefined';
const reservedRootRoutes = new Set([
  'admin',
  'cart',
  'categories',
  'city',
  'driver',
  'login',
  'payments',
  'privacy',
  'profile',
  'restaurants',
  'scanner'
]);

export const appIsRunningStandalone = () => {
  if (!isBrowser()) return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

export const routeCanBeResumed = (path: string) => {
  const normalizedPath = path.trim();
  if (!normalizedPath || normalizedPath === '/' || normalizedPath.startsWith('/login')) return false;
  if (normalizedPath.startsWith('/privacy')) return false;
  const pathWithoutQuery = normalizedPath.split('?')[0].replace(/\/+$/, '') || '/';
  const segments = pathWithoutQuery.split('/').filter(Boolean);
  if (segments.length === 1 && !reservedRootRoutes.has(segments[0])) return false;
  if (segments.length === 2 && segments[0] === 'r') return false;
  return true;
};

export const routeIsRoleAppPath = (path: string) => {
  const normalizedPath = path.trim().split('?')[0].replace(/\/+$/, '') || '/';
  if (normalizedPath === '/driver' || normalizedPath.startsWith('/driver/')) return true;
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) return true;

  const [, slug, section] = normalizedPath.split('/');
  return Boolean(
    slug &&
    !reservedRootRoutes.has(slug) &&
    section &&
    ['dashboard', 'orders', 'dishes', 'settings', 'scanner', 'pos', 'payments'].includes(section)
  );
};

const roleAppKey = (path: string) => {
  const normalizedPath = path.trim().split('?')[0].replace(/\/+$/, '') || '/';
  if (normalizedPath === '/driver' || normalizedPath.startsWith('/driver/')) return 'driver';
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) return 'admin';

  const [, slug, section] = normalizedPath.split('/');
  return slug && !reservedRootRoutes.has(slug) && section && ['dashboard', 'orders', 'dishes', 'settings', 'scanner', 'pos', 'payments'].includes(section)
    ? `restaurant:${slug}`
    : null;
};

export const resolvePwaHomeTarget = ({
  explicitNavigation,
  savedPath,
  sessionRedirect,
  standalone
}: {
  readonly explicitNavigation: boolean;
  readonly savedPath: string | null;
  readonly sessionRedirect: string | null;
  readonly standalone: boolean;
}) => {
  if (explicitNavigation) return null;

  const verifiedPath = sessionRedirect?.trim() || '/';
  const verifiedRole = roleAppKey(verifiedPath);
  if (verifiedRole) {
    return savedPath && roleAppKey(savedPath) === verifiedRole ? savedPath : verifiedPath;
  }
  if (verifiedPath !== '/') return verifiedPath;
  if (!savedPath || roleAppKey(savedPath)) return null;
  return standalone ? savedPath : null;
};

export const buildRestaurantAdminTabPath = (catalogSlug: string, tab: RestaurantAdminTab) =>
  `/${catalogSlug.trim()}/${tab === 'home' ? 'dashboard' : tab}`;

export const rememberPwaResumePath = (path: string) => {
  if (!isBrowser() || !routeCanBeResumed(path)) return;
  window.localStorage.setItem(pwaResumePathKey, path);
};

export const readPwaResumePath = () => {
  if (!isBrowser()) return null;
  const path = window.localStorage.getItem(pwaResumePathKey);
  return path && routeCanBeResumed(path) ? path : null;
};

export const clearPwaResumePath = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(pwaResumePathKey);
};
