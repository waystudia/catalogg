import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCityPickerPath, resolveCityPickerReturnTo } from './clientPlatformNavigation';

test('city picker preserves the marketplace section that opened it', () => {
  assert.equal(buildCityPickerPath('/categories'), '/city?returnTo=%2Fcategories');
  assert.equal(
    buildCityPickerPath('/restaurants?businessCategory=flowers'),
    '/city?returnTo=%2Frestaurants%3FbusinessCategory%3Dflowers'
  );
  assert.equal(resolveCityPickerReturnTo('/categories'), '/categories');
  assert.equal(resolveCityPickerReturnTo('/restaurants?businessCategory=flowers'), '/restaurants?businessCategory=flowers');
});

test('city picker returns home by default and rejects unsafe or recursive targets', () => {
  assert.equal(buildCityPickerPath('/'), '/city');
  assert.equal(resolveCityPickerReturnTo(null), '/');
  assert.equal(resolveCityPickerReturnTo('categories'), '/');
  assert.equal(resolveCityPickerReturnTo('//example.com'), '/');
  assert.equal(resolveCityPickerReturnTo('/city?returnTo=%2Fcategories'), '/');
});
