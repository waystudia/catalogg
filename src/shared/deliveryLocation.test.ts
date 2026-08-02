import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DELIVERY_GEOLOCATION_OPTIONS,
  DELIVERY_LOCATION_TIMEOUT_MS,
  DELIVERY_TARGET_ACCURACY_M,
  chooseMoreAccuratePosition,
  deliveryGeolocationTimeoutMessage,
  deliveryPositionIsAccurateEnough,
  formatDeliveryLocationNote,
  getDeliveryLocationProgress,
  getDeliveryGeolocationErrorMessage,
  getDeliveryLowAccuracyMessage,
  normalizeDeliveryCoordinates,
  resolveStoredDeliveryLocation,
  type DeliveryCoordinates
} from './deliveryLocation';

const coordinates = (overrides: Partial<DeliveryCoordinates> = {}): DeliveryCoordinates => ({
  latitude: 43.318123456,
  longitude: 45.698765432,
  accuracy: 120,
  ...overrides
});

describe('delivery location precision', () => {
  it('uses a strict delivery tracking target and never accepts cached browser positions', () => {
    assert.equal(DELIVERY_TARGET_ACCURACY_M, 10);
    assert.equal(DELIVERY_LOCATION_TIMEOUT_MS, 20_000);
    assert.deepEqual(DELIVERY_GEOLOCATION_OPTIONS, {
      enableHighAccuracy: true,
      timeout: DELIVERY_LOCATION_TIMEOUT_MS,
      maximumAge: 0
    });
  });

  it('keeps whichever coordinate reading has the better accuracy', () => {
    const weak = coordinates({ accuracy: 120 });
    const precise = coordinates({ latitude: 43.4, longitude: 45.8, accuracy: 18 });

    assert.equal(chooseMoreAccuratePosition(null, weak), weak);
    assert.equal(chooseMoreAccuratePosition(weak, precise), precise);
    assert.equal(chooseMoreAccuratePosition(precise, weak), precise);
  });

  it('accepts coordinates at the target accuracy boundary', () => {
    assert.equal(deliveryPositionIsAccurateEnough(coordinates({ accuracy: 35 }), 35), true);
    assert.equal(deliveryPositionIsAccurateEnough(coordinates({ accuracy: 36 }), 35), false);
  });

  it('reports GPS progress only from real accuracy readings', () => {
    assert.equal(getDeliveryLocationProgress(null), 0);
    assert.equal(getDeliveryLocationProgress(2_500), 10);
    assert.equal(getDeliveryLocationProgress(100), 58);
    assert.equal(getDeliveryLocationProgress(20), 84);
    assert.equal(getDeliveryLocationProgress(10), 100);
  });

  it('rounds browser coordinates for stable order storage', () => {
    assert.deepEqual(normalizeDeliveryCoordinates(coordinates({ accuracy: 18.4 })), {
      lat: 43.3181235,
      lng: 45.6987654,
      accuracyM: 18
    });
  });

  it('formats a non-empty location note for restaurant fallback comments', () => {
    assert.equal(
      formatDeliveryLocationNote(43.3181235, 45.6987654, 18),
      'Координаты клиента: 43.3181235, 45.6987654 (точность 18 м)'
    );
  });

  it('explains how to retry when browser location permission was blocked', () => {
    assert.equal(
      getDeliveryGeolocationErrorMessage({ code: 1 }),
      'Геолокация заблокирована. Разрешите доступ к местоположению в настройках сайта браузера и нажмите кнопку ещё раз.'
    );
  });

  it('explains how to retry when browser accuracy is weak or slow', () => {
    assert.equal(
      getDeliveryLowAccuracyMessage(320),
      'Местоположение определилось неточно. Сейчас точность около 320 м. Нажмите кнопку ещё раз для улучшения результата или уточните точку на карте.'
    );
    assert.equal(
      deliveryGeolocationTimeoutMessage,
      'Не удалось быстро получить точную геолокацию. Нажмите кнопку ещё раз для улучшения результата или уточните точку на карте.'
    );
  });

  it('restores coordinates from the fallback order comment when RLS blocked legacy fields', () => {
    assert.deepEqual(
      resolveStoredDeliveryLocation({
        lat: null,
        lng: null,
        accuracyM: null,
        note: 'Позвонить заранее\nКоординаты клиента: 43.2313100, 46.0033982 (точность 18 м)'
      }),
      { lat: 43.23131, lng: 46.0033982, accuracyM: 18 }
    );
  });

  it('normalizes explicit PostgreSQL numeric strings before using comment fallback', () => {
    assert.deepEqual(
      resolveStoredDeliveryLocation({
        lat: '43.3181235',
        lng: '45.6987654',
        accuracyM: '21',
        note: 'Координаты клиента: 1.0000000, 2.0000000'
      }),
      { lat: 43.3181235, lng: 45.6987654, accuracyM: 21 }
    );
  });

  it('rejects out-of-range or incomplete stored coordinates', () => {
    assert.equal(resolveStoredDeliveryLocation({ lat: 91, lng: 45, accuracyM: 10, note: '' }), null);
    assert.equal(resolveStoredDeliveryLocation({ lat: 43, lng: null, accuracyM: 10, note: '' }), null);
  });
});
