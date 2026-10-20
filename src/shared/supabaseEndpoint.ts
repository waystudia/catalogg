const WAYYAAM_ORIGINS = new Set([
  'https://wayyaam.ru',
  'https://www.wayyaam.ru'
]);

/**
 * The production application and its API share one public origin. This keeps
 * catalog, city, and order requests working when a network/VPN treats API
 * subdomains differently from the main site.
 */
export const resolveSupabaseEndpoint = (
  configuredUrl: string | undefined,
  origin = typeof window === 'undefined' ? undefined : window.location.origin
) => {
  const normalizedOrigin = origin?.replace(/\/$/, '');
  if (normalizedOrigin && WAYYAAM_ORIGINS.has(normalizedOrigin)) {
    return `${normalizedOrigin}/api`;
  }

  return configuredUrl?.replace(/\/$/, '');
};
