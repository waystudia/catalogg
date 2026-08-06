export type RestaurantCourierType = 'staff_salaried' | 'independent';

export const restaurantCourierTypeLabels: Record<RestaurantCourierType, string> = {
  staff_salaried: 'Штатный с зарплатой',
  independent: 'Самостоятельный без зарплаты'
};

export function getCourierBillingRule({ courierType, freeDeliveryThresholdReached }: {
  courierType: RestaurantCourierType;
  freeDeliveryThresholdReached: boolean;
}) {
  if (courierType === 'staff_salaried') {
    return {
      courierType,
      restaurantPlatformCommission: 30,
      driverPlatformCommission: 0,
      restaurantFundedDriverPayout: 0,
      payerLabel: 'Комиссию 30 ₽ за доставку платит ресторан'
    } as const;
  }

  return {
    courierType,
    restaurantPlatformCommission: 0,
    driverPlatformCommission: 30,
    restaurantFundedDriverPayout: freeDeliveryThresholdReached ? 200 : 0,
    payerLabel: freeDeliveryThresholdReached
      ? 'Комиссию 30 ₽ платит водитель, ресторан выплачивает ему 200 ₽ за бесплатную доставку'
      : 'Комиссию 30 ₽ за доставку платит водитель'
  } as const;
}
