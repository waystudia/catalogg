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
