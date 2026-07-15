import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const clientApp = readFileSync(resolve(repoRoot, 'src/pages/client-platform/ClientPlatformApp.tsx'), 'utf8');
const restaurantApp = readFileSync(resolve(repoRoot, 'src/app/App.tsx'), 'utf8');
const deliveryLocation = readFileSync(resolve(repoRoot, 'src/shared/deliveryLocation.ts'), 'utf8');
const deliveryMapPicker = readFileSync(resolve(repoRoot, 'src/shared/DeliveryMapPicker.tsx'), 'utf8');
const deliveryGeocoder = readFileSync(resolve(repoRoot, 'src/shared/deliveryGeocoder.ts'), 'utf8');

describe('client delivery location precision contract', () => {
  it('uses one strict shared target for restaurant checkout and client platform checkout', () => {
    assert.match(deliveryLocation, /export const DELIVERY_TARGET_ACCURACY_M = 10/);
    assert.match(deliveryLocation, /export const DELIVERY_LOCATION_TIMEOUT_MS = 20_000/);
    assert.match(deliveryLocation, /maximumAge: 0/);
    assert.doesNotMatch(restaurantApp, /const DELIVERY_TARGET_ACCURACY_M/);
    assert.match(restaurantApp, /DELIVERY_GEOLOCATION_OPTIONS/);
    assert.match(clientApp, /DELIVERY_GEOLOCATION_OPTIONS/);
  });

  it('tracks client location by watching multiple readings and keeping the best one', () => {
    assert.match(clientApp, /navigator\.geolocation\.watchPosition/);
    assert.doesNotMatch(clientApp, /navigator\.geolocation\.getCurrentPosition/);
    assert.match(clientApp, /chooseMoreAccuratePosition\(bestCoordinates, position\.coords\)/);
    assert.match(clientApp, /deliveryPositionIsAccurateEnough\(bestCoordinates, DELIVERY_TARGET_ACCURACY_M\)/);
  });

  it('keeps map search explicit, Chechnya-bounded, and wired into both checkout paths', () => {
    assert.match(deliveryMapPicker, /onSubmit=/);
    assert.doesNotMatch(deliveryMapPicker, /onChange=\{[^}]*searchLocations/);
    assert.match(deliveryGeocoder, /minimumSearchIntervalMs = 1_000/);
    assert.match(deliveryGeocoder, /'ISO3166-2-lvl4'\] !== 'RU-CE'/);
    assert.match(deliveryGeocoder, /bounded', '1'/);
    assert.match(restaurantApp, /onSearchSelect=\{applySearchedDeliveryPlace\}/);
    assert.match(clientApp, /onSearchSelect=\{selectSearchedMapPoint\}/);
  });
});
