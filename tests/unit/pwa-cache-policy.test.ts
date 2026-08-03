import { describe, expect, it } from 'vitest';
import {
  buildNavigationCacheName,
  staleNavigationCacheNames
} from '../../src/shared/pwaCachePolicy';

const manifest = (appShellUrl: string, revision: string | null = null) => [
  { url: 'assets/index-common.css', revision: null },
  { url: appShellUrl, revision },
  { url: 'assets/logo/icon-192.png', revision: 'logo-revision' }
];

describe('PWA navigation cache policy', () => {
  it('gives every hashed application shell its own navigation cache', () => {
    const firstRelease = buildNavigationCacheName(manifest('assets/index-first123.js'));
    const secondRelease = buildNavigationCacheName(manifest('assets/index-second456.js'));

    expect(firstRelease).toBe('catalog-pages-assets-index-first123-js');
    expect(secondRelease).toBe('catalog-pages-assets-index-second456-js');
    expect(secondRelease).not.toBe(firstRelease);
  });

  it('uses an explicit shell revision when the build provides one', () => {
    expect(buildNavigationCacheName(manifest('assets/index-main.js', 'release-42')))
      .toBe('catalog-pages-release-42');
    expect(buildNavigationCacheName(manifest('assets/index-main.js', '///release  42///')))
      .toBe('catalog-pages-release-42');
    expect(buildNavigationCacheName(manifest('assets/index-main.js', '---release-42---')))
      .toBe('catalog-pages-release-42');
  });

  it('uses a safe current fallback when an application shell fingerprint is unavailable', () => {
    expect(buildNavigationCacheName([{ url: 'assets/logo/icon-192.png', revision: 'logo' }]))
      .toBe('catalog-pages-current');
    expect(buildNavigationCacheName(manifest('assets/index-main.js', '///')))
      .toBe('catalog-pages-current');
    expect(buildNavigationCacheName(manifest('assets/index-main.js.map')))
      .toBe('catalog-pages-current');
  });

  it('removes legacy and superseded page caches without touching current or media caches', () => {
    const current = 'catalog-pages-assets-index-current-js';

    expect(staleNavigationCacheNames([
      'catalog-pages',
      'catalog-pages-assets-index-old-js',
      current,
      'catalog-images',
      'catalog-map-tiles',
      'unrelated-catalog-pages-assets-index-old-js',
      'obsolete-catalog-pages-'
    ], current)).toEqual([
      'catalog-pages',
      'catalog-pages-assets-index-old-js'
    ]);
  });
});
