export type PrecacheEntry = {
  url: string;
  revision?: string | null;
};

const navigationCachePrefix = 'catalog-pages-';
const legacyNavigationCacheName = 'catalog-pages';

export const buildNavigationCacheName = (manifest: PrecacheEntry[]) => {
  const appShell = manifest.find((entry) => /(^|\/)assets\/index-[^/]+\.js$/.test(entry.url));
  const releaseId = appShell?.revision || appShell?.url;
  const safeReleaseId = (releaseId ?? '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${navigationCachePrefix}${safeReleaseId || 'current'}`;
};

export const staleNavigationCacheNames = (cacheNames: string[], currentCacheName: string) =>
  cacheNames.filter((cacheName) =>
    cacheName !== currentCacheName && (
      cacheName === legacyNavigationCacheName || cacheName.startsWith(navigationCachePrefix)
    )
  );
