import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RestaurantOrder } from '../../shared/api/restaurantOrdersApi';
import { calculateRestaurantFinance } from './restaurantFinance';

const order = (overrides: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'order-1',
  orderNumber: 'M0001',
  catalogId: 'catalog-1',
  clientName: 'Клиент',
  clientPhone: '',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: '',
  deliveryLat: null,
  deliveryLng: null,
  clientAccuracyM: null,
  deliveryCity: '',
  deliverySettlement: '',
  restaurantAddress: '',
  restaurantCity: '',
  restaurantLat: null,
  restaurantLng: null,
  comment: '',
  status: 'completed',
  paymentStatus: 'confirmed',
  deliveryStatus: 'delivered',
  deliveryId: null,
  deliveryUpdatedAt: null,
  driverName: null,
  driverPhone: null,
  driverVehicleInfo: null,
  driverCarNumber: null,
  driverPhotoUrl: null,
  driverLat: null,
  driverLng: null,
  driverLocationAt: null,
  restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null,
  subtotal: 690,
  deliveryFee: 0,
  total: 690,
  createdAt: new Date().toISOString(),
  acceptedAt: null,
  readyAt: null,
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [],
  ...overrides
});

describe('restaurant finance summary', () => {
  it('shows gross restaurant receipts and keeps a fixed platform debt separate', () => {
    assert.deepEqual(
      calculateRestaurantFinance([order()], {
        tariffType: 'fixed',
        tariffPercent: 7,
        tariffFixed: 30
      }),
      { grossRevenue: 690, platformDebt: 30 }
    );
  });

  it('does not count cancelled orders in revenue or platform debt', () => {
    assert.deepEqual(
      calculateRestaurantFinance([order({ status: 'cancelled' })], {
        tariffType: 'fixed',
        tariffPercent: 7,
        tariffFixed: 30
      }),
      { grossRevenue: 0, platformDebt: 0 }
    );
  });
});
