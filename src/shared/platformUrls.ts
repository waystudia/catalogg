export function getCatalogPublicUrl(slug: string): string {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  base.hash = `/r/${cleanSlug}`;
  return base.toString();
}

export function getCatalogAdminUrl(slug: string): string {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  base.hash = `/business/${cleanSlug}`;
  return base.toString();
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
