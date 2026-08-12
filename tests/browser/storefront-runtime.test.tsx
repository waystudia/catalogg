import { afterEach, expect, test } from 'vitest';
import type { StorefrontContext } from '../../src/entities/storefront';
import { applyStorefrontRuntimeBrand } from '../../src/shared/storefrontRuntime';

const originalTitle = document.title;
const originalHead = document.head.innerHTML;

afterEach(() => {
  document.title = originalTitle;
  document.head.innerHTML = originalHead;
  document.documentElement.style.removeProperty('--storefront-theme');
  document.documentElement.style.removeProperty('--storefront-background');
});

test('verified storefront branding updates PWA metadata without creating another application', () => {
  const storefront: StorefrontContext = {
    catalogId: 'catalog-finiki',
    catalogSlug: 'finiki',
    businessType: 'grocery',
    hostname: 'finiki.example',
    brandName: 'Финики',
    shortName: 'Финики',
    logoUrl: 'https://cdn.example/finiki-logo.png',
    icon192Url: 'https://cdn.example/finiki-192.png',
    icon512Url: 'https://cdn.example/finiki-512.png',
    themeColor: '#8A4B22',
    backgroundColor: '#FFFAF4',
    storefrontMode: 'exclusive',
    poweredByWayYaam: true
  };

  applyStorefrontRuntimeBrand(storefront);

  expect(document.title).toBe('Финики');
  expect(document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content).toBe('Финики');
  expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#8A4B22');
  expect(document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href).toBe('https://cdn.example/finiki-192.png');
  expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href).toContain('hostname=finiki.example');
  expect(document.documentElement.style.getPropertyValue('--storefront-theme')).toBe('#8A4B22');
});
