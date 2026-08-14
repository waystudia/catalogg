import { buildYandexMapsRouteUrl } from '../order/orderLifecycle';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import type { PaymentStatus } from '../../shared/paymentSettings';
import { getBusinessOrderCapabilities } from '../../entities/businessOrderCapabilities';

export type AdminOrderFilter = 'all' | 'new' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export const adminOrderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Новый',
  waiting_payment_confirmation: 'Ждет оплату',
  payment_confirmed: 'Оплата подтверждена',
  accepted: 'Принят',
  confirmed: 'Принят',
  preparing: 'Готовится',
  cooking: 'Готовится',
  ready: 'Готов',
  waiting_driver: 'Ждет водителя',
  driver_assigned: 'Водитель назначен',
  assigned_driver: 'Водитель назначен',
  picked_up: 'Забран',
  on_the_way: 'В пути',
  delivered: 'Доставлен',
  completed: 'Выполнен',
  cancelled: 'Отменен',
  canceled: 'Отменен'
};

export const adminOrderStatusTones: Record<RestaurantOrderStatus, 'new' | 'work' | 'ready' | 'delivery' | 'done' | 'danger'> = {
  new: 'new',
  waiting_payment_confirmation: 'work',
  payment_confirmed: 'work',
  accepted: 'work',
  confirmed: 'work',
  preparing: 'work',
  cooking: 'work',
  ready: 'ready',
  waiting_driver: 'delivery',
  driver_assigned: 'delivery',
  assigned_driver: 'delivery',
  picked_up: 'delivery',
  on_the_way: 'delivery',
  delivered: 'done',
  completed: 'done',
  cancelled: 'danger',
  canceled: 'danger'
};

export const adminOrderStatusFilters: Array<{
  status: AdminOrderFilter;
  label: string;
  orderStatuses: RestaurantOrderStatus[];
}> = [
  { status: 'all', label: 'Все', orderStatuses: [] },
  {
    status: 'new',
    label: 'Новые',
    orderStatuses: ['new', 'waiting_payment_confirmation', 'payment_confirmed']
  },
  {
    status: 'preparing',
    label: 'Готовятся',
    orderStatuses: ['accepted', 'confirmed', 'preparing', 'cooking', 'ready']
  },
  {
    status: 'on_the_way',
    label: 'В пути',
    orderStatuses: ['waiting_driver', 'driver_assigned', 'assigned_driver', 'picked_up', 'on_the_way']
  },
  {
    status: 'delivered',
    label: 'Доставлены',
    orderStatuses: ['delivered', 'completed']
  },
  {
    status: 'cancelled',
    label: 'Отменены',
    orderStatuses: ['cancelled', 'canceled']
  }
];

export const fulfillmentLabels: Record<string, string> = {
  hall: 'В зале',
  takeaway: 'На вынос',
  delivery: 'Доставка'
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачен',
  awaiting: 'Ожидает подтверждения',
  confirmed: 'Подтвержден',
  declined: 'Отклонен'
};

export type OrderPaymentMethod = 'cash' | 'bank_transfer';

export const orderPaymentMethodLabels: Record<OrderPaymentMethod, string> = {
  cash: 'Наличными',
  bank_transfer: 'Безналично'
};

export function formatOrderPaymentMethodMarker(method: OrderPaymentMethod) {
  return `[payment_method:${method}]`;
}

export function getOrderPaymentMethod(comment: string): OrderPaymentMethod {
  const method = comment.match(/\[payment_method:(cash|bank_transfer)\]/iu)?.[1];
  return method === 'bank_transfer' ? 'bank_transfer' : 'cash';
}

export function getAdminOrderItemsCount(order: RestaurantOrder) {
  return order.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
}

export function isGroceryStorePosOrder(order: Pick<RestaurantOrder, 'comment' | 'fulfillmentType'>, businessType?: string) {
  return businessType === 'grocery'
    && order.fulfillmentType !== 'delivery'
    && /(?:^|\n)\s*Касса магазина(?:\s|·|$)/iu.test(order.comment);
}

export function getAdminOrderChannel(order: Pick<RestaurantOrder, 'comment' | 'fulfillmentType'>, businessType?: string) {
  if (isGroceryStorePosOrder(order, businessType)) return 'store';
  return order.fulfillmentType === 'delivery' ? 'delivery' : order.fulfillmentType === 'takeaway' ? 'takeaway' : 'hall';
}

export function getAdminOrderStatusLabel(status: RestaurantOrderStatus, businessType?: string) {
  const capabilities = getBusinessOrderCapabilities(businessType);
  if (status === 'preparing' || status === 'cooking') return capabilities.inProgressStatusLabel;
  if (status === 'ready') return capabilities.readyStatusLabel;
  return adminOrderStatusLabels[status];
}

export function getBusinessPaymentStatusLabel(label: string, businessType?: string) {
  if (businessType !== 'grocery') return label;
  return label.replace(/рестораном/gu, 'магазином').replace(/ресторана/gu, 'магазина');
}

export function formatAdminPaymentSummary(...labels: string[]) {
  return [...new Set(labels.filter(Boolean))].join(' · ');
}

export function getAdminOrderFulfillmentLabel(order: RestaurantOrder, businessType?: string) {
  const capabilities = getBusinessOrderCapabilities(businessType);
  if (order.fulfillmentType === 'delivery') return 'Доставка';
  if (isGroceryStorePosOrder(order, businessType)) return 'Покупка в магазине';
  if (!capabilities.supportsHall || order.fulfillmentType === 'takeaway') return 'Самовывоз';
  return fulfillmentLabels[order.fulfillmentType];
}

export function getAdminOrderLocationLabel(order: RestaurantOrder, businessType?: string) {
  if (businessType === 'grocery' && order.fulfillmentType !== 'delivery') {
    return isGroceryStorePosOrder(order, businessType) ? 'Касса магазина' : 'Самовывоз';
  }
  return order.deliverySettlement || order.deliveryCity || order.deliveryAddress || order.cabinLabel || (order.fulfillmentType === 'takeaway' ? 'Самовывоз' : 'В зале');
}

export function formatAdminOrderItemQuantity(item: RestaurantOrder['items'][number], businessType?: string) {
  if (getBusinessOrderCapabilities(businessType).supportsPicking && item.saleUnit === 'weight') {
    const grams = Math.max(0, Math.round(item.requestedQuantity ?? item.quantity));
    return `${new Intl.NumberFormat('ru-RU').format(grams)} г × ${new Intl.NumberFormat('ru-RU').format(item.unitPrice)} ₽/кг`;
  }
  return `${item.quantity} × ${new Intl.NumberFormat('ru-RU').format(item.unitPrice)} ₽`;
}

export function getVisibleAdminOrderComment(comment: string) {
  return comment
    .replace(/(?:^|\n)\s*\[payment_method:(?:cash|bank_transfer)\]\s*(?=\n|$)/giu, '\n')
    .replace(/(?:^|\n)\s*Координаты клиента:\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:\s*\(точность\s+\d+(?:\.\d+)?\s*м\))?\s*(?=\n|$)/giu, '\n')
    .trim();
}

export function getAdminOrderPhoneHref(phone: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, '');
  return normalizedPhone ? `tel:${normalizedPhone}` : '';
}

export function getAdminOrderWhatsAppHref(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

export function getAdminOrderRouteHref(order: RestaurantOrder) {
  if (order.deliveryLat === null || order.deliveryLng === null || !Number.isFinite(order.deliveryLat) || !Number.isFinite(order.deliveryLng)) return '';

  return buildYandexMapsRouteUrl({
    from: {
      lat: order.restaurantLat,
      lng: order.restaurantLng,
      address: order.restaurantAddress
    },
    to: {
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      address: getAdminOrderLocationLabel(order)
    }
  });
}

export function groupAdminOrdersByMonth(orders: readonly RestaurantOrder[]) {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric'
  });
  const groups = new Map<string, { key: string; label: string; orders: RestaurantOrder[] }>();
  const activeDeliveryOrders = orders.filter((order) => order.fulfillmentType === 'delivery' && !['delivered', 'completed', 'cancelled', 'canceled'].includes(order.status) && !['delivered', 'failed'].includes(order.deliveryStatus)).sort((left, right) => new Date(right.deliveryUpdatedAt ?? right.createdAt).getTime() - new Date(left.deliveryUpdatedAt ?? left.createdAt).getTime());
  const activeOrderIds = new Set(activeDeliveryOrders.map((order) => order.id));
  const sortedOrders = orders.filter((order) => !activeOrderIds.has(order.id)).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  for (const order of sortedOrders) {
    const date = new Date(order.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const group = groups.get(key) ?? {
      key,
      label: formatter.format(date),
      orders: []
    };
    group.orders.push(order);
    groups.set(key, group);
  }

  return [
    ...(activeDeliveryOrders.length > 0
      ? [
          {
            key: 'active-deliveries',
            label: 'Активные доставки',
            orders: activeDeliveryOrders
          }
        ]
      : []),
    ...groups.values()
  ];
}

export function playRestaurantAdminOrderSound() {
  try {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audio = new AudioContextCtor();
    const notes = [
      { frequency: 659.25, start: 0, duration: 0.34 },
      { frequency: 783.99, start: 0.3, duration: 0.34 },
      { frequency: 987.77, start: 0.62, duration: 0.44 },
      { frequency: 1318.51, start: 1.12, duration: 0.34 }
    ];
    const peakGain = 0.34;
    const soundEndsAt = audio.currentTime + 1.55;
    void audio.resume();
    notes.forEach((note, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const startsAt = audio.currentTime + note.start;
      const endsAt = startsAt + note.duration;
      oscillator.type = index === notes.length - 1 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(note.frequency, startsAt);
      gain.gain.setValueAtTime(0.001, startsAt);
      gain.gain.exponentialRampToValueAtTime(peakGain, startsAt + 0.035);
      gain.gain.setValueAtTime(peakGain * 0.82, endsAt - 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, endsAt);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(startsAt);
      oscillator.stop(endsAt);
    });
    window.setTimeout(() => void audio.close(), Math.max(100, Math.ceil((soundEndsAt - audio.currentTime) * 1000) + 100));
  } catch {
    // Browsers may block notification sounds until a user gesture.
  }
}
