import type { BusinessType } from '../../shared/businessTerminology';

export type DriverDeliveryStopStatus =
  | 'pending'
  | 'arrived'
  | 'completed'
  | 'skipped'
  | 'cancelled';

export type DriverDeliveryStop = {
  readonly id: string;
  readonly deliveryId: string;
  readonly merchantOrderId: string | null;
  readonly stopType: 'pickup' | 'dropoff';
  readonly sequence: number;
  readonly status: DriverDeliveryStopStatus;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string;
  readonly merchantName: string;
  readonly merchantType: BusinessType;
  readonly merchantOrderStatus: string | null;
  readonly estimatedReadyAt: string | null;
  readonly estimatedArrivalAt: string | null;
  readonly isPrimary: boolean;
};

const terminalStopStatuses: ReadonlySet<DriverDeliveryStopStatus> = new Set([
  'completed',
  'skipped',
  'cancelled'
]);

export const getVisibleDeliveryStops = (stops: readonly DriverDeliveryStop[]) =>
  [...stops].sort((left, right) => left.sequence - right.sequence);

export const getActiveDeliveryStop = (stops: readonly DriverDeliveryStop[]) =>
  getVisibleDeliveryStops(stops).find((stop) => !terminalStopStatuses.has(stop.status)) ?? null;

export const getCombinedDeliveryRoutePoints = (
  stops: readonly DriverDeliveryStop[],
  driver: { readonly lat: number; readonly lng: number } | null
) => {
  const remaining = getVisibleDeliveryStops(stops)
    .filter((stop) => !terminalStopStatuses.has(stop.status))
    .map((stop) => ({ lat: stop.latitude, lng: stop.longitude }));

  return driver ? [{ lat: driver.lat, lng: driver.lng }, ...remaining] : remaining;
};

export type DriverDeliveryStopAction = {
  readonly nextStatus: 'arrived' | 'completed';
  readonly label: string;
};

export const getDeliveryStopAction = (
  stop: DriverDeliveryStop,
  activeStopId: string | null
): DriverDeliveryStopAction | null => {
  if (stop.id !== activeStopId) return null;
  if (stop.status === 'pending') return { nextStatus: 'arrived', label: 'Я на месте' };
  if (stop.status !== 'arrived') return null;
  return {
    nextStatus: 'completed',
    label: stop.stopType === 'dropoff' ? 'Доставлено' : 'Забрал заказ'
  };
};
