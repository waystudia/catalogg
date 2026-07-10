export type OrderType = 'dine_in' | 'pickup' | 'delivery';

export type OrderStatus =
  | 'new'
  | 'waiting_payment_confirmation'
  | 'payment_confirmed'
  | 'accepted'
  | 'cooking'
  | 'ready'
  | 'waiting_driver'
  | 'assigned_driver'
  | 'picked_up'
  | 'on_the_way'
  | 'completed'
  | 'canceled';

export type PaymentStatus = 'unpaid' | 'waiting_confirmation' | 'confirmed' | 'rejected';

export type DeliveryStatus =
  | 'not_required'
  | 'waiting_courier'
  | 'assigned'
  | 'arrived_to_restaurant'
  | 'handed_over'
  | 'on_the_way'
  | 'arrived_to_client'
  | 'delivered'
  | 'failed';

export type DriverStatus =
  | 'offline'
  | 'online'
  | 'busy'
  | 'heading_to_restaurant'
  | 'at_restaurant'
  | 'picked_up'
  | 'heading_to_client'
  | 'at_client'
  | 'completed';

export type OrderLifecycleSnapshot = {
  readonly id: string;
  readonly orderType: OrderType;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly deliveryAddress: string;
  readonly deliveryComment: string;
  readonly restaurantName: string;
  readonly restaurantAddress: string;
  readonly restaurantLat?: number | null;
  readonly restaurantLng?: number | null;
  readonly deliveryLat?: number | null;
  readonly deliveryLng?: number | null;
  readonly deliveryFee: number;
  readonly distanceKm: number;
};

export type DeliveryAssignment = {
  readonly orderId: string;
  readonly driverId: string;
  readonly status: DeliveryStatus;
  readonly pickupQrToken: string;
  readonly pickupQrExpiresAt: string;
  readonly assignedAt: string;
};

export type DriverDeliveryView = {
  readonly orderId: string;
  readonly restaurantName: string;
  readonly restaurantAddress: string;
  readonly deliveryAddress: string;
  readonly deliveryFee: number;
  readonly distanceKm: number;
  readonly status: DeliveryStatus;
  readonly isAssignedToViewer: boolean;
  readonly itemsVisible: boolean;
  readonly routeToRestaurantUrl: string;
  readonly routeToClientUrl?: string;
  readonly restaurantLat: number | null;
  readonly restaurantLng: number | null;
  readonly deliveryLat: number | null;
  readonly deliveryLng: number | null;
  readonly clientName?: string;
  readonly clientPhone?: string;
  readonly deliveryComment?: string;
  readonly pickupQrToken?: string;
};

type RoutePoint = {
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly address: string;
};

type BuildYandexMapsRouteUrlInput = {
  readonly from?: RoutePoint;
  readonly to: RoutePoint;
};

export type DeliveryPriceRule = {
  readonly fromSettlement: string;
  readonly toSettlement: string;
  readonly amount: number;
};

export const buildDeliveryDestinationAddress = ({
  address,
  settlement,
  city
}: {
  readonly address?: string | null;
  readonly settlement?: string | null;
  readonly city?: string | null;
}) => {
  const parts = [address, settlement, city]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean);

  return Array.from(new Set(parts)).join(', ');
};

type CreatePickupQrTokenInput = {
  readonly orderId: string;
  readonly driverId: string;
  readonly nonce: string;
};

type RotatePickupQrInput = {
  readonly assignment: DeliveryAssignment;
  readonly driverId: string;
  readonly nonce: string;
  readonly assignedAt: string;
  readonly expiresAt: string;
};

type VerifyPickupQrInput = {
  readonly assignment: DeliveryAssignment;
  readonly token: string;
  readonly now: string;
};

type BuildDriverDeliveryViewInput = {
  readonly order: OrderLifecycleSnapshot;
  readonly assignment: DeliveryAssignment | null;
  readonly viewerDriverId: string;
};

type VerifyPickupQrResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'mismatch' | 'expired' | 'not_assigned' };

export const canSendOrderToDelivery = (order: Pick<OrderLifecycleSnapshot, 'orderType' | 'status' | 'paymentStatus'>) =>
  order.orderType === 'delivery' &&
  order.status === 'ready' &&
  (order.paymentStatus === 'confirmed' || order.paymentStatus === 'unpaid');

export const createPickupQrToken = ({ orderId, driverId, nonce }: CreatePickupQrTokenInput) =>
  [orderId.trim(), driverId.trim(), nonce.trim()].join(':');

const hasCoordinates = (point: RoutePoint) =>
  typeof point.lat === 'number' &&
  Number.isFinite(point.lat) &&
  typeof point.lng === 'number' &&
  Number.isFinite(point.lng);

const formatCoordinates = (point: RoutePoint) => `${point.lat},${point.lng}`;

const coordinatesInAddress = (address: string): RoutePoint | null => {
  const match = address.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, address };
};

export const buildYandexMapsRouteUrl = ({ from, to }: BuildYandexMapsRouteUrlInput) => {
  const params = new URLSearchParams();
  const exactTo = hasCoordinates(to) ? to : coordinatesInAddress(to.address) ?? to;
  const exactFrom = from && hasCoordinates(from) ? from : from ? coordinatesInAddress(from.address) ?? from : undefined;

  if (exactFrom && hasCoordinates(exactFrom) && hasCoordinates(exactTo)) {
    params.set('rtext', `${formatCoordinates(exactFrom)}~${formatCoordinates(exactTo)}`);
    params.set('rtt', 'auto');
    return `https://yandex.ru/maps/?${params.toString().replace(/%7E/g, '~')}`;
  }

  params.set('text', hasCoordinates(exactTo) ? formatCoordinates(exactTo) : exactTo.address.trim());
  return `https://yandex.ru/maps/?${params.toString().replace(/%7E/g, '~')}`;
};

export const buildYandexMapsRouteAppUrl = (input: BuildYandexMapsRouteUrlInput) => {
  const webUrl = buildYandexMapsRouteUrl(input);
  const query = webUrl.split('?')[1] ?? '';
  return `yandexmaps://maps.yandex.ru/?${query}`;
};

const normalizeSettlement = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

export const findDeliveryPrice = (
  prices: readonly DeliveryPriceRule[],
  fromSettlement: string,
  toSettlement: string
) => {
  const from = normalizeSettlement(fromSettlement);
  const to = normalizeSettlement(toSettlement);
  if (!from || !to) return null;

  const rule = prices.find(
    (price) => normalizeSettlement(price.fromSettlement) === from && normalizeSettlement(price.toSettlement) === to
  );

  return rule && Number.isFinite(rule.amount) && rule.amount >= 0 ? rule.amount : null;
};

export const rotatePickupQr = ({
  assignment,
  driverId,
  nonce,
  assignedAt,
  expiresAt
}: RotatePickupQrInput): DeliveryAssignment => ({
  ...assignment,
  driverId,
  pickupQrToken: createPickupQrToken({ orderId: assignment.orderId, driverId, nonce }),
  pickupQrExpiresAt: expiresAt,
  assignedAt,
  status: 'assigned'
});

export const verifyPickupQr = ({ assignment, token, now }: VerifyPickupQrInput): VerifyPickupQrResult => {
  if (assignment.status !== 'assigned' && assignment.status !== 'arrived_to_restaurant') {
    return { ok: false, reason: 'not_assigned' };
  }

  if (Date.parse(now) > Date.parse(assignment.pickupQrExpiresAt)) {
    return { ok: false, reason: 'expired' };
  }

  if (token !== assignment.pickupQrToken) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true };
};

export const buildDriverDeliveryView = ({
  order,
  assignment,
  viewerDriverId
}: BuildDriverDeliveryViewInput): DriverDeliveryView => {
  const isAssignedToViewer = assignment?.driverId === viewerDriverId;
  const restaurantPoint = {
    lat: order.restaurantLat,
    lng: order.restaurantLng,
    address: order.restaurantAddress
  };
  const clientPoint = {
    lat: order.deliveryLat,
    lng: order.deliveryLng,
    address: order.deliveryAddress
  };

  return {
    orderId: order.id,
    restaurantName: order.restaurantName,
    restaurantAddress: order.restaurantAddress,
    deliveryAddress: order.deliveryAddress,
    deliveryFee: order.deliveryFee,
    distanceKm: order.distanceKm,
    status: assignment?.status ?? 'waiting_courier',
    isAssignedToViewer,
    itemsVisible: false,
    routeToRestaurantUrl: buildYandexMapsRouteUrl({ to: restaurantPoint }),
    routeToClientUrl: isAssignedToViewer
      ? buildYandexMapsRouteUrl({ from: restaurantPoint, to: clientPoint })
      : undefined,
    restaurantLat: order.restaurantLat ?? null,
    restaurantLng: order.restaurantLng ?? null,
    deliveryLat: order.deliveryLat ?? null,
    deliveryLng: order.deliveryLng ?? null,
    clientName: isAssignedToViewer ? order.clientName : undefined,
    clientPhone: isAssignedToViewer ? order.clientPhone : undefined,
    deliveryComment: isAssignedToViewer ? order.deliveryComment : undefined,
    pickupQrToken: isAssignedToViewer ? assignment.pickupQrToken : undefined
  };
};
