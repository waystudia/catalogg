import type { RestaurantOrder } from '../../shared/api/restaurantOrdersApi';

export type RestaurantBillingTariff = {
  tariffType: 'percent' | 'fixed';
  tariffPercent: number;
  tariffFixed: number;
};

const isBillableOrder = (order: RestaurantOrder) =>
  !['cancelled', 'canceled'].includes(order.status);

export const calculateRestaurantFinance = (
  orders: RestaurantOrder[],
  tariff: RestaurantBillingTariff | null
) => {
  const billableOrders = orders.filter(isBillableOrder);
  const grossRevenue = billableOrders.reduce((total, order) => total + order.total, 0);
  const courierExpense = billableOrders.reduce((total, order) => total + order.courierPayout, 0);
  const platformDebt = tariff
    ? billableOrders.reduce(
        (total, order) =>
          total +
          (tariff.tariffType === 'fixed'
            ? tariff.tariffFixed
            : order.total * tariff.tariffPercent / 100),
        0
      )
    : 0;

  return {
    grossRevenue,
    platformDebt: Math.round(platformDebt),
    courierExpense: Math.round(courierExpense),
    netRevenue: Math.round(grossRevenue - platformDebt - courierExpense)
  };
};
