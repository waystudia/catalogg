import { describe, expect, it } from 'vitest';
import {
  getMainModuleAssetFromShell,
  getStaleAuthClientRefreshUrl
} from '../../src/shared/authClientVersion';

describe('production auth client version guard', () => {
  it('extracts the hashed main module from the production shell', () => {
    expect(getMainModuleAssetFromShell(
      '<script type="module" crossorigin src="/assets/index-current123.js"></script>'
    )).toBe('/assets/index-current123.js');
  });

  it('forces a document reload while preserving the requested Finik cabinet', () => {
    expect(getStaleAuthClientRefreshUrl({
      hostname: 'wayyaam.ru',
      pageUrl: 'https://wayyaam.ru/#/profile?login=1&returnTo=%2Fbusiness%2Ffinik',
      currentAssetUrl: 'https://wayyaam.ru/assets/index-old123.js',
      latestShellHtml: '<script type="module" src="/assets/index-current123.js"></script>'
    })).toBe(
      'https://wayyaam.ru/?auth-refresh=index-current123#/profile?login=1&returnTo=%2Fbusiness%2Ffinik'
    );
  });

  it('does not reload an already current production client', () => {
    expect(getStaleAuthClientRefreshUrl({
      hostname: 'www.wayyaam.ru',
      pageUrl: 'https://www.wayyaam.ru/#/profile',
      currentAssetUrl: '/assets/index-current123.js',
      latestShellHtml: '<script type="module" src="/assets/index-current123.js"></script>'
    })).toBeNull();
  });

  it('does not affect localhost previews', () => {
    expect(getStaleAuthClientRefreshUrl({
      hostname: '127.0.0.1',
      pageUrl: 'http://127.0.0.1:4178/#/profile',
      currentAssetUrl: '/assets/index-old123.js',
      latestShellHtml: '<script type="module" src="/assets/index-current123.js"></script>'
    })).toBeNull();
  });
});
