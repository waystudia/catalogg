import type { DeliveryStatus } from '../order/orderLifecycle';

export const getDriverGrossEarning = (earning: {
  readonly amount: number | string | null | undefined;
  readonly netAmount?: number | string | null;
}) => {
  const amount = Number(earning.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

export const splitDriverHomeOffers = <T>(offers: readonly T[]) => ({
  urgentOffer: offers[0] ?? null,
  otherOffers: offers.slice(1, 3),
  hiddenOffersCount: Math.max(0, offers.length - 3)
});

export type DriverNextAction =
  | {
      readonly label: string;
      readonly status?: DeliveryStatus;
      readonly to?: string;
    }
  | null;

export const getDriverNextAction = (
  status: DeliveryStatus,
  restaurantRouteStarted = false
): DriverNextAction => {
  if (status === 'assigned' && !restaurantRouteStarted) {
    return { label: 'Поехать в ресторан', to: '/driver/map' };
  }
  if (status === 'assigned') return { label: 'Я в ресторане', status: 'arrived_to_restaurant' };
  if (status === 'arrived_to_restaurant') return { label: 'Забрал заказ', status: 'handed_over' };
  if (status === 'handed_over') return { label: 'Выехал к клиенту', status: 'on_the_way' };
  if (status === 'on_the_way') return { label: 'Я у клиента', status: 'arrived_to_client' };
  if (status === 'arrived_to_client') return { label: 'Доставлено', status: 'delivered' };
  return null;
};

const driverDeliveryProgressLabels = [
  'Принял заказ',
  'Еду в ресторан',
  'Забрал заказ',
  'Еду к клиенту',
  'Я у клиента',
  'Доставлено'
] as const;

const driverDeliveryProgressStep: Partial<Record<DeliveryStatus, number>> = {
  assigned: 1,
  arrived_to_restaurant: 2,
  handed_over: 3,
  on_the_way: 4,
  arrived_to_client: 5,
  delivered: 6
};

export const getDriverDeliveryProgress = (
  status: DeliveryStatus,
  restaurantRouteStarted = false
) => ({
  activeStep: status === 'assigned' && restaurantRouteStarted
    ? 2
    : driverDeliveryProgressStep[status] ?? 1,
  labels: [...driverDeliveryProgressLabels]
});
