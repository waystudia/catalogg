import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
const appLineCount = appSource.split('\n').length;

test('App.tsx remains a composition root instead of absorbing extracted screens', () => {
  assert.ok(
    appLineCount <= 3_100,
    `App.tsx contains ${appLineCount} lines; move new screens and domain logic into their owning feature`
  );

  for (const extractedComponent of [
    'CheckoutScreen',
    'DesignEditor',
    'OrderDetailsPanel',
    'RestaurantAdminWorkspace',
    'ProfileSettings',
    'CategoriesSettings',
    'StockSettings'
  ]) {
    assert.doesNotMatch(
      appSource,
      new RegExp(`function\\s+${extractedComponent}\\s*\\(`),
      `${extractedComponent} must stay in its feature module`
    );
  }
});
