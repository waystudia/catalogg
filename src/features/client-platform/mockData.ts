import type {
  ClientAddress,
  ClientOrder,
  ClientPlatformSnapshot,
  PaymentSettings
} from './types';

const image = (id: string, query: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80&${query}`;

export const clientPlatformSnapshot: ClientPlatformSnapshot = {
  banners: [
    {
      id: 'banner-contest',
      title: 'Конкурс от WayCatalog',
      subtitle: 'Закажи на 1000₽ и выиграй приз',
      kind: 'contest',
      imageUrl: '',
      linkUrl: '/restaurants',
      isActive: true
    }
  ],
  supportWhatsapp: '79990000000',
  cities: [
    { id: 'grozny', slug: 'grozny', name: 'Грозный', region: 'Чеченская Республика', isActive: true },
    { id: 'argun', slug: 'argun', name: 'Аргун', region: 'Чеченская Республика', isActive: true },
    { id: 'gudermes', slug: 'gudermes', name: 'Гудермес', region: 'Чеченская Республика', isActive: true },
    { id: 'shalinskiy', slug: 'shalinskiy', name: 'Шали', region: 'Чеченская Республика', isActive: true }
  ],
  categories: [
    { id: 'cat-sushi', slug: 'sushi', name: 'Суши', imageUrl: image('photo-1579871494447-9811cf80d66c', 'sushi'), isActive: true },
    { id: 'cat-pizza', slug: 'pizza', name: 'Пицца', imageUrl: image('photo-1604382354936-07c5d9983bd3', 'pizza'), isActive: true },
    { id: 'cat-kebab', slug: 'kebab', name: 'Шашлык', imageUrl: image('photo-1555939594-58d7cb561ad1', 'kebab'), isActive: true },
    { id: 'cat-burgers', slug: 'burgers', name: 'Бургеры', imageUrl: image('photo-1568901346375-23c9450c58cd', 'burger'), isActive: true },
    { id: 'cat-drinks', slug: 'drinks', name: 'Напитки', imageUrl: image('photo-1544145945-f90425340c7e', 'drinks'), isActive: true },
    { id: 'cat-salads', slug: 'salads', name: 'Салаты', imageUrl: image('photo-1512621776951-a57141f2eefd', 'salad'), isActive: true },
    { id: 'cat-soups', slug: 'soups', name: 'Супы', imageUrl: image('photo-1547592166-23ac45744acd', 'soup'), isActive: true },
    { id: 'cat-desserts', slug: 'desserts', name: 'Десерты', imageUrl: image('photo-1551024506-0bccd828d307', 'dessert'), isActive: true }
  ],
  restaurants: [
    {
      id: 'restaurant-rizih',
      slug: 'rizih',
      name: 'Rizih',
      description: 'Суши, пицца, напитки',
      addressLine: 'пр-т Путина, 20',
      lat: 43.322,
      lng: 45.705,
      cityId: 'grozny',
      serviceCityIds: ['chernoreche', 'berkat-yurt'],
      categorySlugs: ['sushi', 'pizza', 'drinks'],
      logoUrl: '',
      coverUrl: image('photo-1611143669185-af224c5e3252', 'sushi'),
      rating: 4.7,
      minOrderAmount: 500,
      freeDeliveryFrom: 1000,
      deliveryTimeFrom: 30,
      deliveryTimeTo: 40,
      deliveryProvider: 'restaurant',
      theme: {
        accentColor: '#067a46',
        backgroundColor: '#effaf4',
        buttonColor: '#067a46',
        buttonTextColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#0f2418',
        mutedTextColor: '#607568'
      },
      orderTypes: ['dine_in', 'pickup', 'delivery'],
      paymentMethods: ['qr', 'bank_transfer', 'cash'],
      publicPath: '/rizih'
    },
    {
      id: 'restaurant-mangal',
      slug: 'mangal',
      name: 'Мангал',
      description: 'Шашлык, бургеры, хинкал',
      addressLine: 'ул. Мира, 56',
      lat: 43.3221,
      lng: 45.7012,
      cityId: 'grozny',
      serviceCityIds: ['chernoreche'],
      categorySlugs: ['kebab', 'burgers', 'soups'],
      logoUrl: '',
      coverUrl: image('photo-1555939594-58d7cb561ad1', 'grill'),
      rating: 4.8,
      minOrderAmount: 700,
      freeDeliveryFrom: 1300,
      deliveryTimeFrom: 30,
      deliveryTimeTo: 40,
      deliveryProvider: 'platform',
      theme: {
        accentColor: '#a94f17',
        backgroundColor: '#fff6ed',
        buttonColor: '#a94f17',
        buttonTextColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#27130a',
        mutedTextColor: '#775d4b'
      },
      orderTypes: ['dine_in', 'pickup', 'delivery'],
      paymentMethods: ['bank_transfer', 'cash'],
      publicPath: '/mangal'
    },
    {
      id: 'restaurant-barakat',
      slug: 'barakat',
      name: 'Баракат',
      description: 'Пицца, суши, напитки',
      addressLine: 'ул. Ленина, 14',
      lat: 43.3193,
      lng: 45.6951,
      cityId: 'grozny',
      serviceCityIds: ['berkat-yurt'],
      categorySlugs: ['pizza', 'sushi', 'drinks'],
      logoUrl: '',
      coverUrl: image('photo-1565299624946-b28f40a0ae38', 'pizza'),
      rating: 4.6,
      minOrderAmount: 500,
      freeDeliveryFrom: 1100,
      deliveryTimeFrom: 30,
      deliveryTimeTo: 40,
      deliveryProvider: 'restaurant',
      theme: {
        accentColor: '#5b3df4',
        backgroundColor: '#f6f4ff',
        buttonColor: '#5b3df4',
        buttonTextColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#17122c',
        mutedTextColor: '#69617f'
      },
      orderTypes: ['pickup', 'delivery'],
      paymentMethods: ['qr', 'cash'],
      publicPath: '/barakat'
    },
    {
      id: 'restaurant-halal-house',
      slug: 'halal-house',
      name: 'Халяль Хаус',
      description: 'Шашлык, пицца, хинкал',
      addressLine: 'ул. Шейха Али Митаева, 8',
      lat: 43.3156,
      lng: 45.7001,
      cityId: 'grozny',
      serviceCityIds: [],
      categorySlugs: ['kebab', 'pizza', 'soups'],
      logoUrl: '',
      coverUrl: image('photo-1529692236671-f1f6cf9683ba', 'meat'),
      rating: 4.5,
      minOrderAmount: 600,
      freeDeliveryFrom: 1200,
      deliveryTimeFrom: 40,
      deliveryTimeTo: 50,
      deliveryProvider: 'pickup',
      theme: {
        accentColor: '#155e75',
        backgroundColor: '#eef9fb',
        buttonColor: '#155e75',
        buttonTextColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#09222b',
        mutedTextColor: '#58717a'
      },
      orderTypes: ['dine_in', 'pickup'],
      paymentMethods: ['cash'],
      publicPath: '/halal-house'
    },
    {
      id: 'restaurant-vostok',
      slug: 'vkus-vostoka',
      name: 'Вкус Востока',
      description: 'Плов, шашлык, салаты',
      addressLine: 'ул. Восточная, 3',
      lat: 43.1734,
      lng: 45.4709,
      cityId: 'argun',
      serviceCityIds: [],
      categorySlugs: ['kebab', 'salads', 'soups'],
      logoUrl: '',
      coverUrl: image('photo-1604908176997-125f25cc6f3d', 'rice'),
      rating: 4.6,
      minOrderAmount: 500,
      freeDeliveryFrom: 1000,
      deliveryTimeFrom: 30,
      deliveryTimeTo: 40,
      deliveryProvider: 'platform',
      theme: {
        accentColor: '#0f766e',
        backgroundColor: '#effaf8',
        buttonColor: '#0f766e',
        buttonTextColor: '#ffffff',
        cardColor: '#ffffff',
        textColor: '#102422',
        mutedTextColor: '#607573'
      },
      orderTypes: ['pickup', 'delivery'],
      paymentMethods: ['bank_transfer', 'cash'],
      publicPath: '/vkus-vostoka'
    }
  ],
  restaurantCategories: [
    { id: 'rizih-popular', restaurantSlug: 'rizih', slug: 'popular', name: 'Популярное', imageUrl: image('photo-1617196034796-73dfa7b1fd56', 'rolls'), sortOrder: 1 },
    { id: 'rizih-sushi', restaurantSlug: 'rizih', slug: 'sushi', name: 'Суши', imageUrl: image('photo-1579871494447-9811cf80d66c', 'sushi'), sortOrder: 2 },
    { id: 'rizih-pizza', restaurantSlug: 'rizih', slug: 'pizza', name: 'Пицца', imageUrl: image('photo-1604382354936-07c5d9983bd3', 'pizza'), sortOrder: 3 },
    { id: 'rizih-drinks', restaurantSlug: 'rizih', slug: 'drinks', name: 'Напитки', imageUrl: image('photo-1544145945-f90425340c7e', 'drinks'), sortOrder: 4 },
    { id: 'mangal-popular', restaurantSlug: 'mangal', slug: 'popular', name: 'Популярное', imageUrl: image('photo-1555939594-58d7cb561ad1', 'kebab'), sortOrder: 1 },
    { id: 'mangal-kebab', restaurantSlug: 'mangal', slug: 'kebab', name: 'Шашлык', imageUrl: image('photo-1529692236671-f1f6cf9683ba', 'grill'), sortOrder: 2 },
    { id: 'mangal-burgers', restaurantSlug: 'mangal', slug: 'burgers', name: 'Бургеры', imageUrl: image('photo-1568901346375-23c9450c58cd', 'burger'), sortOrder: 3 },
    { id: 'mangal-soups', restaurantSlug: 'mangal', slug: 'soups', name: 'Супы', imageUrl: image('photo-1547592166-23ac45744acd', 'soup'), sortOrder: 4 }
  ],
  dishes: [
    {
      id: 'rizih-philadelphia',
      restaurantSlug: 'rizih',
      categorySlug: 'sushi',
      name: 'Филадельфия',
      description: 'Лосось, сыр, рис, нори',
      price: 500,
      imageUrl: image('photo-1617196034796-73dfa7b1fd56', 'roll'),
      tags: ['Хит'],
      isPopular: true,
      stockCount: 12,
      weight: '280 г'
    },
    {
      id: 'rizih-california',
      restaurantSlug: 'rizih',
      categorySlug: 'sushi',
      name: 'Калифорния с лососем',
      description: 'Лосось, авокадо, тобико',
      price: 450,
      imageUrl: image('photo-1553621042-f6e147245754', 'sushi'),
      tags: ['Популярное'],
      isPopular: true,
      stockCount: 9,
      weight: '260 г'
    },
    {
      id: 'rizih-four-seasons',
      restaurantSlug: 'rizih',
      categorySlug: 'pizza',
      name: 'Четыре сезона',
      description: 'Сыр, грибы, ветчина, томаты',
      price: 550,
      imageUrl: image('photo-1594007654729-407eedc4be65', 'pizza'),
      tags: ['Сытно'],
      isPopular: true,
      stockCount: 7,
      weight: '520 г'
    },
    {
      id: 'rizih-pepperoni',
      restaurantSlug: 'rizih',
      categorySlug: 'pizza',
      name: 'Пицца Пепперони',
      description: 'Пепперони, сыр, томатный соус',
      price: 290,
      imageUrl: image('photo-1628840042765-356cda07504e', 'pepperoni'),
      tags: ['Острое'],
      isPopular: false,
      stockCount: 10,
      weight: '330 г'
    },
    {
      id: 'rizih-lemonade',
      restaurantSlug: 'rizih',
      categorySlug: 'drinks',
      name: 'Домашний лимонад',
      description: 'Цитрус, мята, лед',
      price: 180,
      imageUrl: image('photo-1621263764928-df1444c5e859', 'lemonade'),
      tags: ['Холодное'],
      isPopular: false,
      stockCount: 20,
      weight: '400 мл'
    },
    {
      id: 'mangal-zhizhig',
      restaurantSlug: 'mangal',
      categorySlug: 'soups',
      name: 'Жижиг-галнаш',
      description: 'Говядина, галушки, бульон',
      price: 380,
      imageUrl: image('photo-1547592166-23ac45744acd', 'soup'),
      tags: ['Домашнее'],
      isPopular: true,
      stockCount: 8,
      weight: '420 г'
    },
    {
      id: 'mangal-lamb',
      restaurantSlug: 'mangal',
      categorySlug: 'kebab',
      name: 'Шашлык из баранины',
      description: 'Баранина, лук, зелень',
      price: 690,
      imageUrl: image('photo-1555939594-58d7cb561ad1', 'skewer'),
      tags: ['Хит'],
      isPopular: true,
      stockCount: 11,
      weight: '250 г'
    },
    {
      id: 'mangal-burger',
      restaurantSlug: 'mangal',
      categorySlug: 'burgers',
      name: 'Бургер на углях',
      description: 'Котлета, сыр, овощи',
      price: 420,
      imageUrl: image('photo-1568901346375-23c9450c58cd', 'burger'),
      tags: ['Новое'],
      isPopular: true,
      stockCount: 14,
      weight: '340 г'
    }
  ],
  paymentSettings: [
    {
      restaurantSlug: 'rizih',
      enableQr: true,
      enableBankTransfer: true,
      enableCash: true,
      bankName: 'Сбербанк',
      recipientFullName: 'Исаев Ризван Магомедович',
      recipientPhone: '+7 928 000-00-01',
      paymentComment: 'Оплата заказа Rizih',
      qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=WayCatalog%20Rizih%201470',
      requireManualConfirmation: true
    },
    {
      restaurantSlug: 'mangal',
      enableQr: false,
      enableBankTransfer: true,
      enableCash: true,
      bankName: 'Тинькофф',
      recipientFullName: 'Мусаев Адам Русланович',
      recipientPhone: '+7 928 000-00-02',
      paymentComment: 'Оплата заказа Мангал',
      qrImageUrl: '',
      requireManualConfirmation: true
    }
  ]
};

export const defaultClientAddresses: ClientAddress[] = [
  {
    id: 'address-home',
    title: 'Дом',
    addressLine: 'ул. Ленина, 123, кв. 45',
    lat: 43.3184,
    lng: 45.6927,
    accuracyM: 15,
    entrance: '2',
    floor: '4',
    apartment: '45',
    intercomCode: '45',
    landmark: '',
    comment: 'Подъезд 2, домофон 45',
    isDefault: true
  },
  {
    id: 'address-work',
    title: 'Работа',
    addressLine: 'ул. Мира, 56, офис 12',
    lat: 43.3221,
    lng: 45.7012,
    accuracyM: 25,
    entrance: '',
    floor: '',
    apartment: '12',
    intercomCode: '',
    landmark: 'Офисный центр',
    comment: '',
    isDefault: false
  }
];

export const defaultClientOrders: ClientOrder[] = [
  {
    id: 'WC-12345',
    restaurantSlug: 'rizih',
    restaurantName: 'Rizih',
    orderType: 'delivery',
    deliveryProvider: 'restaurant',
    paymentMethod: 'qr',
    status: 'on_the_way',
    paymentStatus: 'confirmed',
    totalAmount: 1470,
    addressLine: 'ул. Ленина, 123, кв. 45',
    clientName: 'Адам М.',
    clientPhone: '+7 928 123-45-67',
    createdAt: new Date().toISOString(),
    estimatedTimeMin: 20,
    estimatedTimeMax: 30,
    driverName: 'Алан М.',
    driverPhone: '+7 928 555-12-12',
    items: [
      { dishId: 'rizih-philadelphia', name: 'Филадельфия', price: 500, quantity: 1 },
      { dishId: 'rizih-four-seasons', name: 'Четыре сезона', price: 550, quantity: 1 },
      { dishId: 'rizih-pepperoni', name: 'Пицца Пепперони', price: 290, quantity: 1 }
    ]
  }
];

export const fallbackPaymentSettings: PaymentSettings = {
  restaurantSlug: '',
  enableQr: true,
  enableBankTransfer: true,
  enableCash: true,
  bankName: 'Банк ресторана',
  recipientFullName: 'Получатель ресторана',
  recipientPhone: '+7 928 000-00-00',
  paymentComment: 'Оплата заказа WayCatalog',
  qrImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=WayCatalog',
  requireManualConfirmation: true
};
