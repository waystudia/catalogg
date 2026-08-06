import { describe, expect, it } from 'vitest';
import { getCourierBillingRule, restaurantCourierTypeLabels } from '../../src/features/restaurant-billing/restaurantBillingRules';

describe('restaurant courier billing rules', () => {
  it('uses explicit labels for both courier types', () => {
    expect(restaurantCourierTypeLabels).toEqual({
      staff_salaried: 'Штатный с зарплатой',
      independent: 'Самостоятельный без зарплаты'
    });
  });

  it('charges the restaurant for a salaried courier delivery', () => {
    expect(getCourierBillingRule({ courierType: 'staff_salaried', freeDeliveryThresholdReached: false })).toEqual({
      courierType: 'staff_salaried',
      restaurantPlatformCommission: 30,
      driverPlatformCommission: 0,
      restaurantFundedDriverPayout: 0,
      payerLabel: 'Комиссию 30 ₽ за доставку платит ресторан'
    });
  });

  it('charges an independent courier for a paid delivery', () => {
    expect(getCourierBillingRule({ courierType: 'independent', freeDeliveryThresholdReached: false })).toEqual({
      courierType: 'independent',
      restaurantPlatformCommission: 0,
      driverPlatformCommission: 30,
      restaurantFundedDriverPayout: 0,
      payerLabel: 'Комиссию 30 ₽ за доставку платит водитель'
    });
  });

  it('adds the restaurant-funded 200 ₽ payout only for qualifying free delivery by an independent courier', () => {
    expect(getCourierBillingRule({ courierType: 'independent', freeDeliveryThresholdReached: true })).toEqual({
      courierType: 'independent',
      restaurantPlatformCommission: 0,
      driverPlatformCommission: 30,
      restaurantFundedDriverPayout: 200,
      payerLabel: 'Комиссию 30 ₽ платит водитель, ресторан выплачивает ему 200 ₽ за бесплатную доставку'
    });
    expect(getCourierBillingRule({ courierType: 'staff_salaried', freeDeliveryThresholdReached: true })).toEqual({
      courierType: 'staff_salaried',
      restaurantPlatformCommission: 30,
      driverPlatformCommission: 0,
      restaurantFundedDriverPayout: 0,
      payerLabel: 'Комиссию 30 ₽ за доставку платит ресторан'
    });
  });
});
