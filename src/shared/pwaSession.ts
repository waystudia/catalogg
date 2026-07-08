const pwaResumePathKey = 'waycatalog:pwa-resume-path';

const isBrowser = () => typeof window !== 'undefined';

export const appIsRunningStandalone = () => {
  if (!isBrowser()) return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

export const routeCanBeResumed = (path: string) => {
  const normalizedPath = path.trim();
  if (!normalizedPath || normalizedPath === '/' || normalizedPath.startsWith('/login')) return false;
  if (normalizedPath.startsWith('/privacy')) return false;
  return true;
};

export const routeIsRoleAppPath = (path: string) => {
  const normalizedPath = path.trim().split('?')[0].replace(/\/+$/, '') || '/';
  if (normalizedPath === '/driver' || normalizedPath.startsWith('/driver/')) return true;
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) return true;
  if (normalizedPath === '/profile' || normalizedPath.startsWith('/profile/')) return true;

  const [, , section] = normalizedPath.split('/');
  return Boolean(section && ['dashboard', 'orders', 'dishes', 'settings', 'scanner', 'payments'].includes(section));
};

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
