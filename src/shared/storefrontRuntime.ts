import type { StorefrontContext } from '../entities/storefront';

const upsertMeta = (name: string) => {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.append(meta);
  }
  return meta;
};

const upsertLink = (rel: string) => {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.append(link);
  }
  return link;
};

export const buildStorefrontManifestUrl = (hostname: string) => {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  return supabaseUrl
    ? `${supabaseUrl}/functions/v1/storefront-manifest?hostname=${encodeURIComponent(hostname)}`
    : `/manifest.webmanifest?hostname=${encodeURIComponent(hostname)}`;
};

export const applyStorefrontRuntimeBrand = (storefront: StorefrontContext) => {
  document.title = storefront.brandName;
  upsertMeta('application-name').content = storefront.brandName;
  upsertMeta('theme-color').content = storefront.themeColor;
  document.documentElement.style.setProperty('--storefront-theme', storefront.themeColor);
  document.documentElement.style.setProperty('--storefront-background', storefront.backgroundColor);

  const manifest = upsertLink('manifest');
  manifest.href = buildStorefrontManifestUrl(storefront.hostname);
  manifest.crossOrigin = 'anonymous';

  const icon = storefront.icon192Url || storefront.logoUrl;
  if (icon) {
    const appleTouchIcon = upsertLink('apple-touch-icon');
    appleTouchIcon.href = icon;
    const favicon = upsertLink('icon');
    favicon.href = icon;
  }
};
