import { describe, expect, it } from 'vitest';
import { getNavigationScope } from '../../src/shared/navigationScope';
describe('navigation role and establishment scope', () => {
  it.each([
    ['/', 'client'], ['/profile/orders?tab=history','client'], ['/profile/settings','client'],
    ['/driver','driver'], ['/admin','platform'], ['/nested/login','client'], ['/nested/driver','client'], ['/nested/admin','client'], ['/nested/admin/catalogs/finik','client'], ['/nested/mangal/settings','client'], ['/driver/orders/12','driver'], ['/driver/profile','driver'],
    ['/mangal/settings','restaurant:mangal'], ['/finik/dishes','restaurant:finik'],
    ['/admin/catalogs/finik','restaurant:finik'], ['/admin/settings','platform'],
    ['/registration-preview','client'], ['/login',null], ['https://other.test',null], ['//other.test',null]
  ])('isolates %s in %s', (path, scope) => expect(getNavigationScope(path)).toBe(scope));
  it('keeps an owner in the same establishment while viewing its catalog and order', () => {
    expect(getNavigationScope('/mangal/order/12','restaurant:mangal')).toBe('restaurant:mangal');
    expect(getNavigationScope('/mangal','restaurant:mangal')).toBe('restaurant:mangal');
    expect(getNavigationScope('/finik','restaurant:mangal')).toBe('client');
    expect(getNavigationScope('/','restaurant:mangal')).toBe('client');
  });
});
