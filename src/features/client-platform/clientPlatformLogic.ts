import type {
  ClientCartLine,
  ClientCartSummary,
  ClientAddress,
  ClientDeliveryProvider,
  ClientDish,
  ClientOrder,
  ClientOrderStatus,
  ClientOrderType,
  ClientPaymentMethod,
  ClientPaymentStatus,
  ClientRestaurant
} from './types';

type RestaurantFilter = {
  cityId: string;
  categorySlug?: string;
  query?: string;
};

type OrderPaymentNoticeInput = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  orderType: ClientOrderType;
  deliveryProvider: ClientDeliveryProvider;
  paymentMethod: ClientPaymentMethod;
  totalAmount: number;
  addressLine: string;
  clientName: string;
  clientPhone: string;
  createdAt?: string;
  estimatedTimeMin?: number;
  estimatedTimeMax?: number;
  items?: ClientOrder['items'];
};

type ClientReviewInput = {
  restaurantId: string;
  clientName: string;
  clientPhone: string;
  rating: number;
  comment: string;
};

const normalizeText = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

export const filterRestaurants = (
  restaurants: ClientRestaurant[],
  { cityId, categorySlug = 'all', query = '' }: RestaurantFilter
) => {
  const normalizedQuery = normalizeText(query);
  const hasCategory = categorySlug !== '' && categorySlug !== 'all';

  return restaurants.filter((restaurant) => {
    const inCity = restaurant.cityId === cityId || (restaurant.serviceCityIds ?? []).includes(cityId);
    const inCategory = !hasCategory || restaurant.categorySlugs.includes(categorySlug);
    const matchesQuery =
      normalizedQuery.length === 0 ||
      normalizeText(`${restaurant.name} ${restaurant.description}`).includes(normalizedQuery);

    return inCity && inCategory && matchesQuery;
  });
};

export const buildRestaurantPublicPath = (restaurant: Pick<ClientRestaurant, 'slug' | 'publicPath'>) =>
  restaurant.publicPath?.startsWith('/r/') ? restaurant.publicPath : `/r/${restaurant.slug}`;

export const buildYandexMapsUrl = (address: Pick<ClientAddress, 'addressLine' | 'lat' | 'lng'>) => {
  const coordinatesAreUsable = Number.isFinite(address.lat) && Number.isFinite(address.lng);
  if (coordinatesAreUsable) {
    return `https://yandex.ru/maps/?ll=${address.lng},${address.lat}&z=17&pt=${address.lng},${address.lat},pm2rdm`;
  }

  return `https://yandex.ru/maps/?text=${encodeURIComponent(address.addressLine)}`;
};

export const buildSupportWhatsappUrl = (phone: string) => {
  const normalizedPhone = phone.replace(/\D/g, '') || '79990000000';
  return `https://wa.me/${normalizedPhone}`;
};

export const requireSavedRestaurantOrderId = (orderId: string | null) => {
  if (!orderId) {
    throw new Error('Заказ не был сохранён в системе ресторана.');
  }

  return orderId;
};

export const buildClientReviewPayload = (input: ClientReviewInput) => {
  const restaurantId = input.restaurantId.trim();
  const clientName = input.clientName.trim();
  const clientPhone = input.clientPhone.trim();
  const comment = input.comment.trim();
  const rating = Math.min(5, Math.max(1, Math.round(Number.isFinite(input.rating) ? input.rating : 5)));

  if (!restaurantId) {
    throw new Error('Ресторан не найден.');
  }

  if (!clientName || !clientPhone || !comment) {
    throw new Error('Введите имя, телефон и текст отзыва.');
  }

  return {
    restaurantId,
    clientName,
    clientPhone,
    rating,
    comment
  };
};

export const calculateCartSummary = (
  lines: ClientCartLine[],
  dishes: ClientDish[],
  deliveryFee = 0
): ClientCartSummary => {
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  return lines.reduce<ClientCartSummary>(
    (summary, line) => {
      const dish = dishById.get(line.dishId);
      if (!dish) return summary;

      const lineSubtotal = dish.price * line.quantity;

      return {
        quantity: summary.quantity + line.quantity,
        subtotal: summary.subtotal + lineSubtotal,
        deliveryFee,
        total: summary.total + lineSubtotal
      };
    },
    { quantity: 0, subtotal: 0, deliveryFee, total: deliveryFee }
  );
};

export const getDeliveryProviderLabel = (
  deliveryProvider: ClientDeliveryProvider,
  orderType: ClientOrderType = 'delivery'
) => {
  if (orderType === 'dine_in' || deliveryProvider === 'dine_in') return 'Заказ в зале';
  if (orderType === 'pickup' || deliveryProvider === 'pickup') return 'Самовывоз';
  if (deliveryProvider === 'platform') return 'Доставляет водитель платформы';
  return 'Доставляет ресторан';
};

const resolveOrderStatus = (
  orderType: ClientOrderType,
  paymentMethod: ClientPaymentMethod
): { status: ClientOrderStatus; paymentStatus: ClientPaymentStatus } => {
  if (orderType === 'delivery' && paymentMethod !== 'cash') {
    return { status: 'waiting_payment_confirmation', paymentStatus: 'waiting_confirmation' };
  }

  return { status: 'new', paymentStatus: paymentMethod === 'cash' ? 'unpaid' : 'waiting_confirmation' };
};

export const buildOrderAfterClientPaymentNotice = (input: OrderPaymentNoticeInput): ClientOrder => {
  const { status, paymentStatus } = resolveOrderStatus(input.orderType, input.paymentMethod);

  return {
    id: input.id,
    restaurantSlug: input.restaurantSlug,
    restaurantName: input.restaurantName,
    orderType: input.orderType,
    deliveryProvider: input.deliveryProvider,
    paymentMethod: input.paymentMethod,
    status,
    paymentStatus,
    totalAmount: input.totalAmount,
    addressLine: input.addressLine,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    createdAt: input.createdAt ?? new Date().toISOString(),
    estimatedTimeMin: input.estimatedTimeMin ?? 30,
    estimatedTimeMax: input.estimatedTimeMax ?? 40,
    items: input.items ?? []
  };
};
