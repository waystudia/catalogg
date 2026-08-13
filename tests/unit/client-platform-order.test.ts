import { describe, expect, it } from 'vitest';
import {
  buildOrderAfterClientPaymentNotice,
  mergeClientOrderRealtimePatch,
  selectClientOrderForStatus
} from '../../src/features/client-platform/clientPlatformLogic';

const order = (overrides: Partial<Parameters<typeof buildOrderAfterClientPaymentNotice>[0]> = {}) =>
  buildOrderAfterClientPaymentNotice({
    id: 'order-1',
    restaurantSlug: 'rizih',
    restaurantName: 'Rizih',
    orderType: 'delivery',
    deliveryProvider: 'platform',
    paymentMethod: 'cash',
    totalAmount: 1200,
    addressLine: 'ул. Ленина, 123',
    clientName: 'Адам',
    clientPhone: '+7 928 123-45-67',
    ...overrides
  });

describe('client platform order status helpers', () => {
  it('keeps the tenant catalog id for the order chat', () => {
    expect(order({ catalogId: 'catalog-rizih' }).catalogId).toBe('catalog-rizih');
  });

  it('finds the exact requested order id for the status page', () => {
    expect(
      selectClientOrderForStatus(
        [order({ id: 'order-1' }), order({ id: 'order-2' })],
        'rizih',
        'order-2'
      )?.id
    ).toBe('order-2');
  });

  it('never substitutes a different order when a requested id is missing', () => {
    expect(selectClientOrderForStatus([order()], 'rizih', 'missing')).toBeNull();
  });

  it('uses the newest local restaurant order when no id is provided', () => {
    expect(
      selectClientOrderForStatus(
        [
          order({ id: 'old', createdAt: '2026-07-10T10:00:00.000Z' }),
          order({ id: 'other-restaurant', restaurantSlug: 'mangal', createdAt: '2026-07-12T10:00:00.000Z' }),
          order({ id: 'new', createdAt: '2026-07-11T10:00:00.000Z' })
        ],
        'rizih'
      )?.id
    ).toBe('new');
  });

  it('does not write undefined realtime fields into a stored order patch', () => {
    const patch = mergeClientOrderRealtimePatch({
      driverName: 'Алан',
      status: undefined
    });

    expect(patch).toEqual({ driverName: 'Алан' });
    expect(Object.prototype.hasOwnProperty.call(patch, 'status')).toBe(false);
  });

  it('keeps an empty object when every realtime field is undefined', () => {
    const patch = mergeClientOrderRealtimePatch({
      status: undefined,
      paymentStatus: undefined,
      driverName: undefined,
      driverPhone: undefined,
      driverLat: undefined,
      driverLng: undefined,
      driverLocationAt: undefined
    });

    expect(Object.keys(patch)).toEqual([]);
  });

  it('keeps every defined realtime field in the stored order patch', () => {
    expect(
      mergeClientOrderRealtimePatch({
        status: 'assigned_driver',
        paymentStatus: 'confirmed',
        driverName: 'Алан',
        driverPhone: '+7 928 000-00-00',
        driverLat: 43.3,
        driverLng: 45.7,
        driverLocationAt: '2026-07-12T10:15:00.000Z'
      })
    ).toEqual({
      status: 'assigned_driver',
      paymentStatus: 'confirmed',
      driverName: 'Алан',
      driverPhone: '+7 928 000-00-00',
      driverLat: 43.3,
      driverLng: 45.7,
      driverLocationAt: '2026-07-12T10:15:00.000Z'
    });
  });
});
