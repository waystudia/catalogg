import { describe, expect, it } from 'vitest';
import {
  DELIVERY_GEOLOCATION_OPTIONS,
  DELIVERY_LOCATION_TIMEOUT_MS,
  DELIVERY_TARGET_ACCURACY_M,
  resolveStoredDeliveryLocation
} from '../../src/shared/deliveryLocation';

describe('stored delivery location', () => {
  it('keeps precise browser tracking settings for delivery GPS capture', () => {
    expect(DELIVERY_TARGET_ACCURACY_M).toBe(10);
    expect(DELIVERY_LOCATION_TIMEOUT_MS).toBe(20_000);
    expect(DELIVERY_GEOLOCATION_OPTIONS).toEqual({
      enableHighAccuracy: true,
      timeout: DELIVERY_LOCATION_TIMEOUT_MS,
      maximumAge: 0
    });
  });

  it('prefers valid explicit numeric fields and normalizes accuracy', () => {
    expect(resolveStoredDeliveryLocation({
      lat: '43.3021000',
      lng: '45.7052000',
      accuracyM: -4.6,
      note: 'Координаты клиента: 1, 2 (точность 9 м)'
    })).toEqual({ lat: 43.3021, lng: 45.7052, accuracyM: 0 });
  });

  it('restores legacy coordinates and accuracy from the order comment', () => {
    expect(resolveStoredDeliveryLocation({
      lat: null,
      lng: null,
      accuracyM: null,
      note: 'Домофон 7\nКоординаты клиента: 43.2471234, 45.6887654 (точность 13.6 м)'
    })).toEqual({ lat: 43.2471234, lng: 45.6887654, accuracyM: 14 });
  });

  it('rejects incomplete and out-of-range coordinate pairs', () => {
    expect(resolveStoredDeliveryLocation({ lat: 90, lng: 180, accuracyM: null, note: '' }))
      .toEqual({ lat: 90, lng: 180, accuracyM: null });
    expect(resolveStoredDeliveryLocation({ lat: 91, lng: 45, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({ lat: 45, lng: 181, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({ lat: 43, lng: null, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({
      lat: null,
      lng: null,
      accuracyM: null,
      note: 'Координаты клиента: -91, 181'
    })).toBeNull();
  });

  it('accepts integer legacy coordinates without an accuracy suffix and ignores blank explicit values', () => {
    expect(resolveStoredDeliveryLocation({
      lat: '   ',
      lng: '45',
      accuracyM: null,
      note: 'Координаты клиента: 43, 45'
    })).toEqual({ lat: 43, lng: 45, accuracyM: null });
  });
});
