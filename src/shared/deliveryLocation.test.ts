import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseMoreAccuratePosition,
  deliveryPositionIsAccurateEnough,
  formatDeliveryLocationNote,
  normalizeDeliveryCoordinates,
  type DeliveryCoordinates
} from './deliveryLocation';

const coordinates = (overrides: Partial<DeliveryCoordinates> = {}): DeliveryCoordinates => ({
  latitude: 43.318123456,
  longitude: 45.698765432,
  accuracy: 120,
  ...overrides
});

describe('delivery location precision', () => {
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
});
