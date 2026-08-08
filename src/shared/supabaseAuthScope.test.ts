import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSupabaseAuthFallbackStorageKeys,
  getSupabaseAuthScope,
  getSupabaseAuthStorageKeyForRedirect,
  handoffSupabaseSessionToScope
} from './supabaseAuthScope';

describe('Supabase auth scopes', () => {
  it('keeps driver, restaurant and platform admin sessions independent', () => {
    assert.equal(getSupabaseAuthScope('#/driver/orders'), 'driver');
    assert.equal(getSupabaseAuthScope('#/mangal/settings'), 'restaurant-admin');
    assert.equal(getSupabaseAuthScope('#/mangal/pos'), 'restaurant-admin');
    assert.equal(getSupabaseAuthScope('/rizih/dashboard'), 'restaurant-admin');
    assert.equal(getSupabaseAuthScope('/restaurant/activation'), 'restaurant-admin');
    assert.equal(getSupabaseAuthScope('#/admin/subscriptions'), 'platform-admin');
  });

  it('keeps public client and generic login sessions separate from role apps', () => {
    assert.equal(getSupabaseAuthScope('#/profile/orders'), 'client');
    assert.equal(getSupabaseAuthScope('#/mangal'), 'client');
    assert.equal(getSupabaseAuthScope('#/login'), 'login');
    assert.equal(getSupabaseAuthStorageKeyForRedirect('/driver'), 'waycatalog-auth-driver');
  });

  it('never replaces a driver session with a client or admin account from another tab', () => {
    assert.deepEqual(getSupabaseAuthFallbackStorageKeys('driver'), [
      'waycatalog-auth-driver',
      'waycatalog-auth-login',
      'waycatalog-auth'
    ]);
    assert.deepEqual(getSupabaseAuthFallbackStorageKeys('platform-admin'), [
      'waycatalog-auth-platform-admin',
      'waycatalog-auth-login',
      'waycatalog-auth'
    ]);
  });

  it('moves a completed login session into the destination role without leaving a refresh-token copy', () => {
    const values = new Map<string, string>([
      ['waycatalog-auth-login', 'fresh-superadmin-session'],
      ['waycatalog-auth-driver', 'independent-driver-session']
    ]);
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value)
        }
      }
    });

    try {
      handoffSupabaseSessionToScope('platform-admin');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    assert.equal(values.get('waycatalog-auth-platform-admin'), 'fresh-superadmin-session');
    assert.equal(values.has('waycatalog-auth-login'), false);
    assert.equal(values.get('waycatalog-auth-driver'), 'independent-driver-session');
  });

  it('does not disturb role sessions when there is no completed login session to hand off', () => {
    const values = new Map<string, string>([
      ['waycatalog-auth-driver', 'independent-driver-session']
    ]);
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value)
        }
      }
    });

    try {
      handoffSupabaseSessionToScope('platform-admin');
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow
      });
    }

    assert.deepEqual([...values.entries()], [
      ['waycatalog-auth-driver', 'independent-driver-session']
    ]);
  });
});
