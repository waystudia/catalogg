import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeCanBeResumed, routeIsRoleAppPath } from './pwaSession';

describe('PWA resume route rules', () => {
  it('does not resume root or login routes', () => {
    assert.equal(routeCanBeResumed('/'), false);
    assert.equal(routeCanBeResumed('/login'), false);
  });

  it('resumes role-specific app routes', () => {
    assert.equal(routeCanBeResumed('/driver'), true);
    assert.equal(routeCanBeResumed('/admin/clients'), true);
    assert.equal(routeCanBeResumed('/r/mangal/order/83ec0369'), true);
    assert.equal(routeCanBeResumed('/profile/orders'), true);
  });

  it('identifies role app routes that can be restored from the root screen', () => {
    assert.equal(routeIsRoleAppPath('/driver/profile'), true);
    assert.equal(routeIsRoleAppPath('/mangal/dashboard'), true);
    assert.equal(routeIsRoleAppPath('/admin/clients'), true);
    assert.equal(routeIsRoleAppPath('/mangal'), false);
  });
});
