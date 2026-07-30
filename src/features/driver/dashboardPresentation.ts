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

export const getDriverNextAction = (status: DeliveryStatus): DriverNextAction => {
  if (status === 'assigned') return { label: 'Я в ресторане', status: 'arrived_to_restaurant' };
  if (status === 'arrived_to_restaurant') return { label: 'Забрал заказ', status: 'handed_over' };
  if (status === 'handed_over') return { label: 'Выехал к клиенту', status: 'on_the_way' };
  if (status === 'on_the_way') return { label: 'Я у клиента', status: 'arrived_to_client' };
  if (status === 'arrived_to_client') return { label: 'Доставлено', status: 'delivered' };
  return null;
};
