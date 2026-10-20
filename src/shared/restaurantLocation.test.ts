import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRestaurantMapUrl,
  buildYandexMapLink,
  parseRestaurantCoordinatesFromMapLink
} from './restaurantLocation';

describe('restaurant location links', () => {
  it('reads Yandex ll coordinates as longitude then latitude', () => {
    assert.deepEqual(
      parseRestaurantCoordinatesFromMapLink('https://yandex.ru/maps/?ll=45.6986000%2C43.3178000&z=16'),
      { lat: 43.3178, lng: 45.6986 }
    );
  });

  it('prefers Yandex point coordinates when both point and map center are present', () => {
    assert.deepEqual(
      parseRestaurantCoordinatesFromMapLink('https://yandex.ru/maps/?ll=45.1,43.1&pt=45.6807903,43.3198743,pm2rdm'),
      { lat: 43.3198743, lng: 45.6807903 }
    );
  });

  it('keeps pasted plain coordinates in latitude then longitude order', () => {
    assert.deepEqual(parseRestaurantCoordinatesFromMapLink('43.3198743, 45.6807903'), {
      lat: 43.3198743,
      lng: 45.6807903
    });
  });

  it('builds Yandex links in longitude then latitude order', () => {
    assert.equal(
      buildYandexMapLink(43.3178, 45.6986),
      'https://yandex.ru/maps/?ll=45.6986,43.3178&z=16&pt=45.6986,43.3178,pm2rdm'
    );
  });

  it('opens the current saved coordinates instead of a stale manual link', () => {
    assert.equal(
      buildRestaurantMapUrl({
        lat: 43.3178,
        lng: 45.6986,
        mapLink: 'https://yandex.ru/maps/?text=старый+адрес',
        city: 'Курчалой',
        address: 'ул. Центральная, 12'
      }),
      buildYandexMapLink(43.3178, 45.6986)
    );
  });

  it('falls back to the latest city and address when coordinates and a link are absent', () => {
    assert.equal(
      buildRestaurantMapUrl({
        lat: null,
        lng: null,
        city: 'Курчалой',
        address: 'ул. Центральная, 12'
      }),
      'https://yandex.ru/maps/?text=%D0%9A%D1%83%D1%80%D1%87%D0%B0%D0%BB%D0%BE%D0%B9%2C%20%D1%83%D0%BB.%20%D0%A6%D0%B5%D0%BD%D1%82%D1%80%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%2C%2012'
    );
  });

  it('keeps an explicit map link when coordinates are absent', () => {
    assert.equal(
      buildRestaurantMapUrl({
        lat: null,
        lng: null,
        mapLink: ' https://yandex.ru/maps/?text=ресторан '
      }),
      'https://yandex.ru/maps/?text=ресторан'
    );
  });

  it('returns an empty link when no location is configured', () => {
    assert.equal(buildRestaurantMapUrl({ lat: null, lng: null }), '');
  });
});
