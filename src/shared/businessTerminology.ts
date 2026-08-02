export const BUSINESS_TYPES = ['restaurant', 'coffee_shop', 'confectionery'] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const DEFAULT_BUSINESS_TYPE: BusinessType = 'restaurant';

export type BusinessTerms = {
  readonly place: string;
  readonly placeLower: string;
  readonly placeAccusative: string;
  readonly placePrepositional: string;
  readonly placeInstrumental: string;
  readonly placeGenitive: string;
  readonly placeDative: string;
  readonly item: string;
  readonly itemLower: string;
  readonly items: string;
  readonly itemGenitive: string;
  readonly addItem: string;
  readonly driverRoute: string;
  readonly driverRouteAction: string;
  readonly driverArrival: string;
  readonly driverAtPlaceStatus: string;
  readonly orderPrepared: string;
  readonly paymentConfirmation: string;
};

export const BUSINESS_TERMINOLOGY: Readonly<Record<BusinessType, BusinessTerms>> = {
  restaurant: {
    place: 'Ресторан',
    placeLower: 'ресторан',
    placeAccusative: 'ресторан',
    placePrepositional: 'ресторане',
    placeInstrumental: 'рестораном',
    placeGenitive: 'ресторана',
    placeDative: 'ресторану',
    item: 'Блюдо',
    itemLower: 'блюдо',
    items: 'Блюда',
    itemGenitive: 'блюда',
    addItem: 'Добавить блюдо',
    driverRoute: 'Еду в ресторан',
    driverRouteAction: 'Поехать в ресторан',
    driverArrival: 'Я в ресторане',
    driverAtPlaceStatus: 'На месте в ресторане',
    orderPrepared: 'Заказ приготовлен рестораном',
    paymentConfirmation: 'Ресторан получил заказ и проверяет оплату.'
  },
  coffee_shop: {
    place: 'Кофейня',
    placeLower: 'кофейня',
    placeAccusative: 'кофейню',
    placePrepositional: 'кофейне',
    placeInstrumental: 'кофейней',
    placeGenitive: 'кофейни',
    placeDative: 'кофейне',
    item: 'Позиция',
    itemLower: 'позиция',
    items: 'Позиции',
    itemGenitive: 'позиции',
    addItem: 'Добавить позицию',
    driverRoute: 'Еду в кофейню',
    driverRouteAction: 'Поехать в кофейню',
    driverArrival: 'Я в кофейне',
    driverAtPlaceStatus: 'На месте в кофейне',
    orderPrepared: 'Заказ приготовлен кофейней',
    paymentConfirmation: 'Кофейня получила заказ и проверяет оплату.'
  },
  confectionery: {
    place: 'Кондитерская',
    placeLower: 'кондитерская',
    placeAccusative: 'кондитерскую',
    placePrepositional: 'кондитерской',
    placeInstrumental: 'кондитерской',
    placeGenitive: 'кондитерской',
    placeDative: 'кондитерской',
    item: 'Товар',
    itemLower: 'товар',
    items: 'Товары',
    itemGenitive: 'товара',
    addItem: 'Добавить товар',
    driverRoute: 'Еду в кондитерскую',
    driverRouteAction: 'Поехать в кондитерскую',
    driverArrival: 'Я в кондитерской',
    driverAtPlaceStatus: 'На месте в кондитерской',
    orderPrepared: 'Заказ приготовлен кондитерской',
    paymentConfirmation: 'Кондитерская получила заказ и проверяет оплату.'
  }
};

export const normalizeBusinessType = (value: unknown): BusinessType => {
  if (value === 'coffee_shop' || value === 'coffee') return 'coffee_shop';
  if (value === 'confectionery' || value === 'bakery') return 'confectionery';
  return DEFAULT_BUSINESS_TYPE;
};

export const getBusinessTerms = (value: unknown): BusinessTerms =>
  BUSINESS_TERMINOLOGY[normalizeBusinessType(value)];
