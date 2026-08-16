import { describe, expect, it } from 'vitest';
import {
  buildRestaurantAdminTabPath,
  resolvePwaHomeTarget,
  routeIsRoleAppPath
} from '../../src/shared/pwaSession';

describe('PWA navigation', () => {
  it('treats client profile pages as public navigation rather than a staff role app', () => {
    expect(routeIsRoleAppPath('/profile/orders')).toBe(false);
    expect(routeIsRoleAppPath('/driver')).toBe(true);
    expect(routeIsRoleAppPath('/driver/orders')).toBe(true);
    expect(routeIsRoleAppPath('/admin')).toBe(true);
    expect(routeIsRoleAppPath('/admin/restaurants')).toBe(true);
    expect(routeIsRoleAppPath('/mangal/dashboard')).toBe(true);
    expect(routeIsRoleAppPath('/mangal/chats/order-chat-1')).toBe(true);
    expect(routeIsRoleAppPath('/business/finik')).toBe(true);
    expect(routeIsRoleAppPath('/mangal/settings/?tab=delivery')).toBe(true);
    expect(routeIsRoleAppPath('/profile/settings')).toBe(false);
    expect(routeIsRoleAppPath('/mangal/menu')).toBe(false);
  });

  it('does not resume any saved path after an explicit home navigation', () => {
    expect(resolvePwaHomeTarget({
      explicitNavigation: true,
      savedPath: '/profile/orders',
      sessionRedirect: '/driver',
      standalone: true
    })).toBeNull();
  });

  it('resumes a deeper route only when it belongs to the verified current role', () => {
    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/driver/orders',
      sessionRedirect: '/driver',
      standalone: true
    })).toBe('/driver/orders');

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/driver/orders',
      sessionRedirect: '/business/mangal',
      standalone: true
    })).toBe('/business/mangal');

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/business/mangal/orders',
      sessionRedirect: '/business/mangal',
      standalone: true
    })).toBe('/business/mangal/orders');

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/business/mangal/orders',
      sessionRedirect: '/business/rizih',
      standalone: true
    })).toBe('/business/rizih');
  });

  it('rejects staff routes for expired sessions but resumes public pages only in standalone mode', () => {
    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/driver/orders',
      sessionRedirect: '/',
      standalone: true
    })).toBeNull();

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: null,
      sessionRedirect: '/profile/orders',
      standalone: true
    })).toBe('/profile/orders');

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/profile/orders',
      sessionRedirect: '/',
      standalone: true
    })).toBe('/profile/orders');

    expect(resolvePwaHomeTarget({
      explicitNavigation: false,
      savedPath: '/profile/orders',
      sessionRedirect: '/',
      standalone: false
    })).toBeNull();
  });

  it('gives every restaurant tab a stable resumable route', () => {
    expect(buildRestaurantAdminTabPath('  mangal  ', 'home')).toBe('/mangal/dashboard');
    expect(buildRestaurantAdminTabPath('mangal', 'orders')).toBe('/mangal/orders');
    expect(buildRestaurantAdminTabPath('mangal', 'chats')).toBe('/mangal/chats');
    expect(buildRestaurantAdminTabPath('mangal', 'dishes')).toBe('/mangal/dishes');
    expect(buildRestaurantAdminTabPath('mangal', 'scanner')).toBe('/mangal/scanner');
    expect(buildRestaurantAdminTabPath('mangal', 'pos')).toBe('/mangal/pos');
    expect(buildRestaurantAdminTabPath('mangal', 'settings')).toBe('/mangal/settings');
  });
});
