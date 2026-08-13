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

  it('keeps the current document query while moving an authenticated user into every role cabinet', () => {
    const refreshedClientSearch = '?auth-refresh=index-current123';

    expect(buildRoleAppUrl('/business/finik', refreshedClientSearch)).toBe(
      '/?auth-refresh=index-current123#/business/finik'
    );
    expect(buildRoleAppUrl('/mangal/dashboard', refreshedClientSearch)).toBe(
      '/?auth-refresh=index-current123#/mangal/dashboard'
    );
    expect(buildRoleAppUrl('/driver', refreshedClientSearch)).toBe(
      '/?auth-refresh=index-current123#/driver'
    );
    expect(buildRoleAppUrl('/admin/clients', refreshedClientSearch)).toBe(
      '/?auth-refresh=index-current123#/admin/clients'
    );
    expect(buildRoleAppUrl('driver', 'auth-refresh=index-current123')).toBe(
      '/?auth-refresh=index-current123#/driver'
    );
    expect(buildRoleAppUrl('admin/clients')).toBe('/#/admin/clients');
  });

  it('replaces only the hash after a stale production client refresh', () => {
    const previousWindow = globalThis.window;
    let replacedUrl = '';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          search: '?auth-refresh=index-current123',
          replace: (url: string) => {
            replacedUrl = url;
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

    expect(replacedUrl).toBe('/?auth-refresh=index-current123#/admin/clients');
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
