export const GROCERY_CATALOG_ASSET_VERSION = 'grocery-catalog-20260814-v2';

const GROCERY_ASSET_PATH = '/assets/template-grocery/';

export function versionGroceryCatalogAssetUrl(value: string) {
  if (!value || !value.includes(GROCERY_ASSET_PATH)) return value;

  const isAbsolute = /^https?:\/\//iu.test(value);
  const isProtocolRelative = value.startsWith('//');
  const isRootRelative = value.startsWith('/');
  const url = new URL(value, 'https://wayyaam.local');
  url.searchParams.set('v', GROCERY_CATALOG_ASSET_VERSION);

  if (isAbsolute) return url.toString();
  if (isProtocolRelative) return `//${url.host}${url.pathname}${url.search}${url.hash}`;
  if (isRootRelative) return `${url.pathname}${url.search}${url.hash}`;
  return `${url.pathname.replace(/^\//u, '')}${url.search}${url.hash}`;
}
