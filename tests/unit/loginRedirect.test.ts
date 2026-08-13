import { describe, expect, it } from 'vitest';
import {
  assertExpectedLoginRole,
  getExpectedLoginRoleForReturnTo,
  getCatalogWorkspaceRedirect,
  getProductionAuthConfigurationError,
  getRequestedCatalogSlugForReturnTo
} from '../../src/shared/api/loginRedirectApi';
import {
  buildProfileLoginPath,
  buildRoleAppUrl,
  redirectToRoleApp,
  resolveProfileLoginTarget
} from '../../src/shared/appNavigation';

describe('staff login role selection', () => {
  it('opens every role login inside the client profile and rejects unsafe return paths', () => {
    expect(buildProfileLoginPath('/business/finik')).toBe(
      '/profile?login=1&returnTo=%2Fbusiness%2Ffinik'
    );
    expect(buildProfileLoginPath('//external.example')).toBe(
      '/profile?login=1&returnTo=%2Fprofile'
    );
  });

  it('reports a deployment configuration failure instead of claiming every production account is unlinked', () => {
    expect(getProductionAuthConfigurationError('wayyaam.ru', false)).toBe(
      'Сервис входа временно не настроен. Мы уже исправляем подключение.'
    );
    expect(getProductionAuthConfigurationError('www.wayyaam.ru', false)).toBeTruthy();
    expect(getProductionAuthConfigurationError('127.0.0.1', false)).toBeNull();
    expect(getProductionAuthConfigurationError('wayyaam.ru', true)).toBeNull();
  });

  it('routes each authenticated role without allowing a client session into a role cabinet', () => {
    expect(resolveProfileLoginTarget('/admin', '/profile')).toBe('/admin/clients');
    expect(resolveProfileLoginTarget('/business/finik', '/profile')).toBe('/business/finik');
    expect(resolveProfileLoginTarget('/profile', '/r/mangal/checkout')).toBe('/r/mangal/checkout');
    expect(resolveProfileLoginTarget('/profile', '/admin/clients')).toBe('/profile');
    expect(resolveProfileLoginTarget('/profile', '/business/finik')).toBe('/profile');
  });

  it('builds short shareable links for every role cabinet', () => {
    expect(buildRoleAppUrl('/business/finik')).toBe('/#/business/finik');
    expect(buildRoleAppUrl('/mangal/dashboard')).toBe('/#/mangal/dashboard');
    expect(buildRoleAppUrl('/driver')).toBe('/#/driver');
    expect(buildRoleAppUrl('/admin/clients')).toBe('/#/admin/clients');
    expect(buildRoleAppUrl('driver')).toBe('/#/driver');
    expect(buildRoleAppUrl('admin/clients')).toBe('/#/admin/clients');
  });

  it('selects the clean role URL before reloading into its isolated auth scope', () => {
    const previousWindow = globalThis.window;
    let cleanedState: unknown;
    let cleanedTitle = 'not-called';
    let cleanedUrl = '';
    let replacedUrl = '';
    let reloadCalls = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://wayyaam.ru/?auth-refresh=index-current123#/profile?login=1&returnTo=%2Fbusiness%2Ffinik',
          search: '?auth-refresh=index-current123',
          reload: () => {
            reloadCalls += 1;
          },
          replace: (url: string) => {
            replacedUrl = url;
          }
        },
        history: {
          state: { preserved: true },
          replaceState: (state: unknown, title: string, url: string) => {
            cleanedState = state;
            cleanedTitle = title;
            cleanedUrl = url;
          }
        }
      }
    });

    try {
      redirectToRoleApp('/admin/clients');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    expect(cleanedState).toEqual({ preserved: true });
    expect(cleanedTitle).toBe('');
    expect(cleanedUrl).toBe('/#/admin/clients');
    expect(replacedUrl).toBe('');
    expect(reloadCalls).toBe(1);
  });

  it('still reloads from a clean profile URL so the destination scope owns the Supabase client', () => {
    const previousWindow = globalThis.window;
    let historyCalls = 0;
    let cleanedUrl = '';
    let replacedUrl = '';
    let reloadCalls = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://wayyaam.ru/#/profile?login=1&returnTo=%2Fbusiness%2Ffinik',
          reload: () => {
            reloadCalls += 1;
          },
          replace: (url: string) => {
            replacedUrl = url;
          }
        },
        history: {
          state: null,
          replaceState: (_state: unknown, _title: string, url: string) => {
            historyCalls += 1;
            cleanedUrl = url;
          }
        }
      }
    });

    try {
      redirectToRoleApp('/business/finik');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    expect(historyCalls).toBe(1);
    expect(cleanedUrl).toBe('/#/business/finik');
    expect(replacedUrl).toBe('');
    expect(reloadCalls).toBe(1);
  });

  it('falls back to location replacement before reloading when browser history is unavailable', () => {
    const previousWindow = globalThis.window;
    let replacedUrl = '';
    let reloadCalls = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          reload: () => {
            reloadCalls += 1;
          },
          replace: (url: string) => {
            replacedUrl = url;
          }
        },
        history: {
          state: null,
          replaceState: () => {
            throw new DOMException('History unavailable', 'SecurityError');
          }
        }
      }
    });

    try {
      redirectToRoleApp('/driver');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    expect(replacedUrl).toBe('/#/driver');
    expect(reloadCalls).toBe(1);
  });

  it('leaves role navigation inert during server rendering', () => {
    const previousWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, 'window');

    try {
      expect(() => redirectToRoleApp('/driver')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }
  });

  it('routes groceries to the universal business workspace without changing restaurants', () => {
    expect(getCatalogWorkspaceRedirect({ slug: 'finik', business_type: 'grocery' })).toBe('/business/finik');
    expect(getCatalogWorkspaceRedirect({ slug: 'mangal', business_type: 'restaurant' })).toBe('/mangal/dashboard');
  });

  it('extracts the exact requested business profile before resolving a shared role', () => {
    expect(getRequestedCatalogSlugForReturnTo('/business/finik')).toBe('finik');
    expect(getRequestedCatalogSlugForReturnTo('/mangal/dashboard')).toBe('mangal');
    expect(getRequestedCatalogSlugForReturnTo('/profile')).toBeNull();
    expect(getRequestedCatalogSlugForReturnTo('//external.example/dashboard')).toBeNull();
  });

  it('does not let a role login fall back to an ordinary customer account', () => {
    expect(getExpectedLoginRoleForReturnTo('/business/finik')).toBe('restaurant');
    expect(getExpectedLoginRoleForReturnTo('/admin/clients')).toBe('restaurant');
    expect(getExpectedLoginRoleForReturnTo('/driver/orders')).toBe('driver');
    expect(getExpectedLoginRoleForReturnTo('/r/finik/checkout')).toBeUndefined();
  });

  it('accepts the matching driver and restaurant destinations', () => {
    expect(() => assertExpectedLoginRole('/driver', 'driver')).not.toThrow();
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'restaurant')).not.toThrow();
    expect(() => assertExpectedLoginRole('/business/finik', 'restaurant')).not.toThrow();
    expect(() => assertExpectedLoginRole('/restaurant/activation', 'restaurant')).not.toThrow();
  });

  it('explains when a restaurant account is entered under driver', () => {
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'driver')).toThrow(
      'Это бизнес-аккаунт. Откройте его бизнес-профиль.'
    );
    expect(() => assertExpectedLoginRole('/business/finik', 'driver')).toThrow(
      'Это бизнес-аккаунт. Откройте его бизнес-профиль.'
    );
  });

  it('explains when a driver account is entered under restaurant', () => {
    expect(() => assertExpectedLoginRole('/driver', 'restaurant')).toThrow(
      'Это аккаунт водителя. Выберите «Водитель».'
    );
  });

  it('rejects accounts that have no selected staff role', () => {
    expect(() => assertExpectedLoginRole('/', 'restaurant')).toThrow(
      'Этот аккаунт не привязан к бизнес-профилю.'
    );
    expect(() => assertExpectedLoginRole('/admin', 'driver')).toThrow(
      'Это бизнес-аккаунт. Откройте его бизнес-профиль.'
    );
  });
});
