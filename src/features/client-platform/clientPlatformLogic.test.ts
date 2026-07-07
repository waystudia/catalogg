import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildYandexMapsUrl,
  buildClientReviewPayload,
  buildRestaurantPublicPath,
  buildOrderAfterClientPaymentNotice,
  requireSavedRestaurantOrderId,
  buildSupportWhatsappUrl,
  calculateCartSummary,
  filterRestaurants,
  getDeliveryProviderLabel
} from './clientPlatformLogic';
import type { ClientCartLine, ClientDish, ClientRestaurant } from './types';

const restaurants: ClientRestaurant[] = [
  {
    id: 'restaurant-rizih',
    slug: 'rizih',
    name: 'Rizih',
    description: 'Суши и пицца',
    addressLine: 'пр-т Путина, 20',
    lat: 43.322,
    lng: 45.705,
    cityId: 'grozny',
    serviceCityIds: ['chernoreche'],
    categorySlugs: ['sushi', 'pizza'],
    logoUrl: '',
    coverUrl: '',
    rating: 4.7,
    minOrderAmount: 500,
    freeDeliveryFrom: 900,
    deliveryTimeFrom: 30,
    deliveryTimeTo: 40,
    deliveryProvider: 'restaurant',
    theme: {
      accentColor: '#057a3d',
      backgroundColor: '#f2fbf6',
      buttonColor: '#057a3d',
      buttonTextColor: '#ffffff',
      cardColor: '#ffffff',
      textColor: '#10241a',
      mutedTextColor: '#577064'
    },
    orderTypes: ['dine_in', 'pickup', 'delivery'],
    paymentMethods: ['qr', 'bank_transfer', 'cash']
  },
  {
    id: 'restaurant-mangal',
    slug: 'mangal',
    name: 'Мангал',
    description: 'Шашлык',
    addressLine: 'ул. Мира, 56',
    lat: 43.3221,
    lng: 45.7012,
    cityId: 'grozny',
    categorySlugs: ['kebab'],
    logoUrl: '',
    coverUrl: '',
    rating: 4.8,
    minOrderAmount: 700,
    freeDeliveryFrom: 1200,
    deliveryTimeFrom: 30,
    deliveryTimeTo: 40,
    deliveryProvider: 'platform',
    theme: {
      accentColor: '#8b4513',
      backgroundColor: '#fff8f1',
      buttonColor: '#8b4513',
      buttonTextColor: '#ffffff',
      cardColor: '#ffffff',
      textColor: '#241309',
      mutedTextColor: '#786154'
    },
    orderTypes: ['pickup', 'delivery'],
    paymentMethods: ['bank_transfer', 'cash']
  },
  {
    id: 'restaurant-berkat',
    slug: 'berkat',
    name: 'Баракат',
    description: 'Пицца и напитки',
    addressLine: 'ул. Ленина, 14',
    lat: 43.3193,
    lng: 45.6951,
    cityId: 'argun',
    categorySlugs: ['pizza', 'drinks'],
    logoUrl: '',
    coverUrl: '',
    rating: 4.6,
    minOrderAmount: 400,
    freeDeliveryFrom: 1000,
    deliveryTimeFrom: 25,
    deliveryTimeTo: 35,
    deliveryProvider: 'pickup',
    theme: {
      accentColor: '#5b3df4',
      backgroundColor: '#f6f4ff',
      buttonColor: '#5b3df4',
      buttonTextColor: '#ffffff',
      cardColor: '#ffffff',
      textColor: '#18112f',
      mutedTextColor: '#6f6686'
    },
    orderTypes: ['pickup'],
    paymentMethods: ['cash']
  }
];

const dishes: ClientDish[] = [
  {
    id: 'rolls',
    restaurantSlug: 'rizih',
    categorySlug: 'sushi',
    name: 'Роллы',
    description: 'Сет роллов',
    price: 520,
    imageUrl: '',
    tags: ['Хит'],
    isPopular: true,
    stockCount: 6
  },
  {
    id: 'pizza',
    restaurantSlug: 'rizih',
    categorySlug: 'pizza',
    name: 'Пицца',
    description: 'Пепперони',
    price: 450,
    imageUrl: '',
    tags: ['Острое'],
    isPopular: false,
    stockCount: 4
  }
];

describe('client platform restaurant filtering', () => {
  it('keeps restaurant search inside the selected city and platform category', () => {
    const result = filterRestaurants(restaurants, {
      cityId: 'grozny',
      categorySlug: 'pizza',
      query: 'riz'
    });

    assert.deepEqual(
      result.map((restaurant) => restaurant.slug),
      ['rizih']
    );
  });

  it('returns every restaurant in a city when category and search are empty', () => {
    const result = filterRestaurants(restaurants, { cityId: 'grozny', categorySlug: 'all', query: '' });

    assert.deepEqual(
      result.map((restaurant) => restaurant.slug),
      ['rizih', 'mangal']
    );
  });

  it('shows restaurants that serve the selected settlement even when their main city is different', () => {
    const result = filterRestaurants(restaurants, { cityId: 'chernoreche', categorySlug: 'all', query: '' });

    assert.deepEqual(
      result.map((restaurant) => restaurant.slug),
      ['rizih']
    );
  });
});

describe('client platform restaurant links', () => {
  it('opens restaurants through the client platform restaurant route', () => {
    assert.equal(buildRestaurantPublicPath(restaurants[0]), '/r/rizih');
  });

  it('keeps legacy catalog public paths out of the client platform restaurant cards', () => {
    assert.equal(buildRestaurantPublicPath({ slug: 'mangal', publicPath: '/mangal' }), '/r/mangal');
  });
});

describe('client platform address maps', () => {
  it('opens Yandex Maps with the selected delivery coordinates', () => {
    assert.equal(
      buildYandexMapsUrl({
        addressLine: 'ул. Ленина, 123',
        lat: 43.3184,
        lng: 45.6927
      }),
      'https://yandex.ru/maps/?ll=45.6927,43.3184&z=17&pt=45.6927,43.3184,pm2rdm'
    );
  });

  it('falls back to address search when coordinates are not set yet', () => {
    assert.equal(
      buildYandexMapsUrl({
        addressLine: 'Грозный, проспект Путина',
        lat: Number.NaN,
        lng: Number.NaN
      }),
      'https://yandex.ru/maps/?text=%D0%93%D1%80%D0%BE%D0%B7%D0%BD%D1%8B%D0%B9%2C%20%D0%BF%D1%80%D0%BE%D1%81%D0%BF%D0%B5%D0%BA%D1%82%20%D0%9F%D1%83%D1%82%D0%B8%D0%BD%D0%B0'
    );
  });
});

describe('client platform support links', () => {
  it('opens WhatsApp support with a normalized phone number', () => {
    assert.equal(buildSupportWhatsappUrl('+7 (999) 000-00-11'), 'https://wa.me/79990000011');
  });

  it('uses the platform fallback number when support number is empty', () => {
    assert.equal(buildSupportWhatsappUrl(''), 'https://wa.me/79990000000');
  });
});

describe('client platform order persistence', () => {
  it('does not allow a client-visible order without a saved restaurant order id', () => {
    assert.throws(() => requireSavedRestaurantOrderId(null), /Заказ не был сохранён в системе ресторана/);
  });
});

describe('client platform reviews', () => {
  it('builds a trimmed restaurant review with a rating inside the allowed range', () => {
    assert.deepEqual(
      buildClientReviewPayload({
        restaurantId: 'restaurant-1',
        clientName: ' Адам ',
        clientPhone: ' +7 928 123-45-67 ',
        rating: 7,
        comment: '  Вкусно и быстро  '
      }),
      {
        restaurantId: 'restaurant-1',
        clientName: 'Адам',
        clientPhone: '+7 928 123-45-67',
        rating: 5,
        comment: 'Вкусно и быстро'
      }
    );
  });

  it('requires client contacts and review text before sending a restaurant review', () => {
    assert.throws(
      () =>
        buildClientReviewPayload({
          restaurantId: 'restaurant-1',
          clientName: 'Адам',
          clientPhone: '',
          rating: 4,
          comment: ' '
        }),
      /Введите имя, телефон и текст отзыва/
    );
  });
});

describe('client platform cart summary', () => {
  it('calculates quantity, subtotal, delivery fee and total from restaurant-local cart lines', () => {
    const lines: ClientCartLine[] = [
      { dishId: 'rolls', quantity: 2 },
      { dishId: 'pizza', quantity: 1 }
    ];

    assert.deepEqual(calculateCartSummary(lines, dishes, 120), {
      quantity: 3,
      subtotal: 1490,
      deliveryFee: 120,
      total: 1610
    });
  });
});

describe('client platform order statuses', () => {
  it('keeps a delivery order waiting for restaurant payment confirmation after client marks it paid', () => {
    const order = buildOrderAfterClientPaymentNotice({
      id: 'order-1',
      restaurantSlug: 'rizih',
      restaurantName: 'Rizih',
      orderType: 'delivery',
      deliveryProvider: 'restaurant',
      paymentMethod: 'qr',
      totalAmount: 1470,
      addressLine: 'ул. Ленина, 123',
      clientName: 'Адам',
      clientPhone: '+7 928 123-45-67'
    });

    assert.equal(order.status, 'waiting_payment_confirmation');
    assert.equal(order.paymentStatus, 'waiting_confirmation');
    assert.equal(getDeliveryProviderLabel(order.deliveryProvider, order.orderType), 'Доставляет ресторан');
  });

  it('marks pickup cash orders as new and unpaid because delivery prepayment is not required', () => {
    const order = buildOrderAfterClientPaymentNotice({
      id: 'order-2',
      restaurantSlug: 'mangal',
      restaurantName: 'Мангал',
      orderType: 'pickup',
      deliveryProvider: 'pickup',
      paymentMethod: 'cash',
      totalAmount: 900,
      addressLine: '',
      clientName: 'Адам',
      clientPhone: '+7 928 123-45-67'
    });

    assert.equal(order.status, 'new');
    assert.equal(order.paymentStatus, 'unpaid');
    assert.equal(getDeliveryProviderLabel(order.deliveryProvider, order.orderType), 'Самовывоз');
  });
});
