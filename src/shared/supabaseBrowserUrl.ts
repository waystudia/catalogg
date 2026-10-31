/** The existing WayYaam proxy avoids separate-domain routing failures on mobile/VPN networks. */
export function resolveSupabaseBrowserUrl(configuredUrl: string | undefined, pageOrigin?: string) {
  if (!configuredUrl || configuredUrl.replace(/\/+$/, '') !== 'https://api.wayyaam.ru' || !pageOrigin) return configuredUrl;
  try {
    const page = new URL(pageOrigin);
    if (page.protocol === 'https:' && ['wayyaam.ru', 'www.wayyaam.ru'].includes(page.hostname)) {
      return `${page.origin}/api`;
    }
  } catch {
    // A missing/invalid browser origin keeps the explicitly configured backend.
  }
  return configuredUrl;
}

/** Keep public image traffic on the same proven edge route as other browser API calls. */
export function resolveSupabasePublicImageUrl(source: string, pageOrigin?: string): string {
  const backend = 'https://api.wayyaam.ru';
  if (!source.startsWith(`${backend}/storage/v1/object/public/`)) return source;
  return resolveSupabaseBrowserUrl(backend, pageOrigin) + source.slice(backend.length);
}
