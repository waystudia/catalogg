import { describe, expect, it, vi } from 'vitest';
import { driverHasCapacity, normalizeDriverCapacity } from '../../src/shared/driverCapacity';
import type { DeliveryOffer } from '../../src/shared/api/deliveryApi';

const assignedDelivery = (deliveryId: string): DeliveryOffer => ({
  businessType: 'restaurant',
  catalogId: 'catalog-1',
  deliveryId,
  orderId: `order-${deliveryId}`,
  orderNumber: deliveryId,
  createdAt: '2026-08-14T10:00:00.000Z',
  itemsCount: 2,
  orderTotal: 900,
  clientDeliveryFee: 250,
  paymentLabel: 'Оплата подтверждена',
  restaurantLogoUrl: '',
  routeEtaMin: 15,
  paymentMethod: 'bank_transfer',
  restaurantPaymentConfirmed: true,
  restaurantFundsDelivery: false,
  restaurantDeliveryPayoutAmount: 0,
  driverRestaurantOrderPaymentConfirmedAt: null,
  driverRestaurantOrderPaymentAmount: 0,
  driverRestaurantDeliveryPayoutReceivedAt: null,
  driverRestaurantDeliveryPayoutReceivedAmount: 0,
  pickupQrConfirmed: false,
  restaurantName: 'Мангал',
  restaurantAddress: 'Цоци-Юрт, ул. Центральная, 1',
  deliveryAddress: 'Цоци-Юрт, ул. Мира, 5',
  deliveryFee: 250,
  distanceKm: 3.2,
  status: 'assigned',
  isAssignedToViewer: true,
  itemsVisible: true,
  routeToRestaurantUrl: 'https://yandex.ru/maps/?rtext=~43.2,45.7',
  routeToClientUrl: 'https://yandex.ru/maps/?rtext=43.2,45.7~43.3,45.8',
  restaurantLat: 43.2,
  restaurantLng: 45.7,
  deliveryLat: 43.3,
  deliveryLng: 45.8,
  clientName: 'Клиент',
  clientPhone: '+7 928 000-00-00',
  deliveryComment: '',
  pickupQrToken: 'pickup-token'
});

describe('driver capacity', () => {
  it('normalizes invalid values and database limits', () => {
    expect(normalizeDriverCapacity(undefined)).toBe(1);
    expect(normalizeDriverCapacity(0)).toBe(1);
    expect(normalizeDriverCapacity(2.9)).toBe(2);
    expect(normalizeDriverCapacity(11)).toBe(10);
  });

  it('allows another order only below the exact limit', () => {
    expect(driverHasCapacity(0, 1)).toBe(true);
    expect(driverHasCapacity(1, 1)).toBe(false);
    expect(driverHasCapacity(1, 2)).toBe(true);
    expect(driverHasCapacity(2, 2)).toBe(false);
  });

  it('updates and completes only the selected active delivery', async () => {
    const persisted = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => persisted.set(key, value),
      removeItem: (key: string) => persisted.delete(key)
    });
    const { useDriverStore } = await import('../../src/features/driver/store');
    const secondDelivery = assignedDelivery('second');
    useDriverStore.setState({
      localActiveDelivery: secondDelivery,
      completedDeliveryIds: [],
      dismissedDeliveryIds: []
    });

    useDriverStore.getState().updateLocalDeliveryStatus('first', 'delivered');
    expect(useDriverStore.getState().localActiveDelivery).toEqual(secondDelivery);

    useDriverStore.getState().completeLocalDelivery('first');
    expect(useDriverStore.getState().localActiveDelivery).toEqual(secondDelivery);
    expect(useDriverStore.getState().completedDeliveryIds).toEqual(['first']);

    useDriverStore.getState().updateLocalDeliveryStatus('second', 'on_the_way');
    expect(useDriverStore.getState().localActiveDelivery?.status).toBe('on_the_way');

    useDriverStore.getState().completeLocalDelivery('second');
    expect(useDriverStore.getState().localActiveDelivery).toBeNull();
    expect(useDriverStore.getState().completedDeliveryIds).toEqual(['second', 'first']);

    useDriverStore.getState().updateLocalDeliveryStatus('missing', 'delivered');
    expect(useDriverStore.getState().localActiveDelivery).toBeNull();

    useDriverStore.setState({ completedDeliveryIds: ['first', 'first', 'second'] });
    useDriverStore.getState().completeLocalDelivery('first');
    expect(useDriverStore.getState().localActiveDelivery).toBeNull();
    expect(useDriverStore.getState().completedDeliveryIds).toEqual(['first', 'second']);

    useDriverStore.setState({
      localActiveDelivery: secondDelivery,
      completedDeliveryIds: ['second', 'first']
    });
    useDriverStore.getState().completeLocalDelivery('second');
    expect(useDriverStore.getState().localActiveDelivery).toBeNull();
    expect(useDriverStore.getState().completedDeliveryIds).toEqual(['second', 'first']);
  });
});
