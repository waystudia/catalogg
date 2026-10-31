/** Navigation provenance is isolated by role and establishment; it never grants access. */
export function getNavigationScope(pathname: string, previous?: string): string | null {
  const path = pathname.split(/[?#]/)[0];
  if (!path.startsWith('/') || path.startsWith('//') || /^\/login(?:\/|$)/.test(path)) return null;
  const catalogAdmin = path.match(/^\/admin\/catalogs\/([^/]+)/);
  if (catalogAdmin) return `restaurant:${catalogAdmin[1]}`;
  if (/^\/admin(?:\/|$)/.test(path)) return 'platform';
  if (/^\/driver(?:\/|$)/.test(path)) return 'driver';
  const restaurant = path.match(/^\/([^/]+)\/(?:dashboard|orders|dishes|finance|settings|scanner|payments|pos)(?:\/|$)/);
  if (restaurant && restaurant[1] !== 'profile') return `restaurant:${restaurant[1]}`;
  const slug = path.split('/')[1];
  if (slug && previous === `restaurant:${slug}`) return previous;
  return 'client';
}
