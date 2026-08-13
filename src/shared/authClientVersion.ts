const PRODUCTION_HOSTS = new Set(['wayyaam.ru', 'www.wayyaam.ru']);
const MAIN_MODULE_PATTERN = /<script\b[^>]*\bsrc=["']([^"']*\/assets\/index-[^"']+\.js(?:\?[^"']*)?)["'][^>]*>/i;

const normalizeAssetPath = (assetUrl: string, pageUrl: string) => {
  try {
    return new URL(assetUrl, pageUrl).pathname;
  } catch {
    return '';
  }
};

export const getMainModuleAssetFromShell = (html: string) =>
  MAIN_MODULE_PATTERN.exec(html)?.[1] ?? null;

export const getStaleAuthClientRefreshUrl = ({
  hostname,
  pageUrl,
  currentAssetUrl,
  latestShellHtml
}: {
  hostname: string;
  pageUrl: string;
  currentAssetUrl: string;
  latestShellHtml: string;
}) => {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!PRODUCTION_HOSTS.has(normalizedHostname)) return null;

  const latestAssetUrl = getMainModuleAssetFromShell(latestShellHtml);
  const currentAssetPath = normalizeAssetPath(currentAssetUrl, pageUrl);
  const latestAssetPath = latestAssetUrl ? normalizeAssetPath(latestAssetUrl, pageUrl) : '';
  if (!currentAssetPath || !latestAssetPath || currentAssetPath === latestAssetPath) return null;

  const nextUrl = new URL(pageUrl);
  const releaseMarker = latestAssetPath.split('/').pop()?.replace(/\.js$/, '') ?? 'latest';
  nextUrl.searchParams.set('auth-refresh', releaseMarker);
  return nextUrl.toString();
};

let activeVersionCheck: Promise<boolean> | null = null;

export const refreshStaleAuthClient = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const hostname = window.location.hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!PRODUCTION_HOSTS.has(hostname)) return false;
  if (activeVersionCheck) return activeVersionCheck;

  const check = (async () => {
    try {
      const currentAssetUrl = document
        .querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
        ?.src;
      if (!currentAssetUrl) return false;

      const shellUrl = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
      const response = await window.fetch(shellUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'text/html' }
      });
      if (!response.ok) return false;

      const refreshUrl = getStaleAuthClientRefreshUrl({
        hostname,
        pageUrl: window.location.href,
        currentAssetUrl,
        latestShellHtml: await response.text()
      });
      if (!refreshUrl) return false;

      window.location.replace(refreshUrl);
      return true;
    } catch {
      return false;
    }
  })();
  activeVersionCheck = check;
  try {
    return await check;
  } finally {
    if (activeVersionCheck === check) activeVersionCheck = null;
  }
};
