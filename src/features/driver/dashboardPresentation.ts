import type { DeliveryStatus } from '../order/orderLifecycle';
import { getBusinessTerms, type BusinessType } from '../../shared/businessTerminology';

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

export type DriverLocationSnapshot = {
  readonly lastLat: number | null;
  readonly lastLng: number | null;
  readonly lastLocationAt: string | null;
};

const locationTimestamp = (location: DriverLocationSnapshot) => {
  const timestamp = Date.parse(location.lastLocationAt!);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

export const preferFreshDriverLocation = <T extends DriverLocationSnapshot>(
  serverProfile: T,
  currentPhoneLocation: DriverLocationSnapshot | null
): T => {
  if (!currentPhoneLocation || locationTimestamp(serverProfile) > locationTimestamp(currentPhoneLocation)) {
    return serverProfile;
  }

  return { ...serverProfile, ...currentPhoneLocation };
};

export type DriverNextAction =
  | {
      readonly label: string;
      readonly status?: DeliveryStatus;
      readonly to?: string;
    }
  | null;

export const getDriverNextAction = (
  status: DeliveryStatus,
  restaurantRouteStarted = false,
  businessType: BusinessType = 'restaurant'
): DriverNextAction => {
  const terms = getBusinessTerms(businessType);
  if (status === 'assigned' && !restaurantRouteStarted) {
    return { label: terms.driverRouteAction, to: '/driver/map' };
  }
  if (status === 'assigned') return { label: terms.driverArrival, status: 'arrived_to_restaurant' };
  if (status === 'arrived_to_restaurant') return { label: 'Забрал заказ', status: 'handed_over' };
  if (status === 'handed_over') return { label: 'Выехал к клиенту', status: 'on_the_way' };
  if (status === 'on_the_way') return { label: 'Я у клиента', status: 'arrived_to_client' };
  if (status === 'arrived_to_client') return { label: 'Доставлено', status: 'delivered' };
  return null;
};

const getDriverDeliveryProgressLabels = (businessType: BusinessType) => [
  'Принял заказ',
  getBusinessTerms(businessType).driverRoute,
  'Забрал заказ',
  'Еду к клиенту',
  'Я у клиента',
  'Доставлено'
];

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
  restaurantRouteStarted = false,
  businessType: BusinessType = 'restaurant'
) => ({
  activeStep: status === 'assigned' && restaurantRouteStarted
    ? 2
    : driverDeliveryProgressStep[status] ?? 1,
  labels: getDriverDeliveryProgressLabels(businessType)
});
