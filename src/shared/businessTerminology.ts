import {
  BUSINESS_TYPES,
  isBusinessType,
  type BusinessType
} from './businessRegistry';

export { BUSINESS_TYPES };
export type { BusinessType };

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
  },
  grocery: {
    place: 'Магазин',
    placeLower: 'магазин',
    placeAccusative: 'магазин',
    placePrepositional: 'магазине',
    placeInstrumental: 'магазином',
    placeGenitive: 'магазина',
    placeDative: 'магазину',
    item: 'Товар',
    itemLower: 'товар',
    items: 'Товары',
    itemGenitive: 'товара',
    addItem: 'Добавить товар',
    driverRoute: 'Еду в магазин',
    driverRouteAction: 'Поехать в магазин',
    driverArrival: 'Я в магазине',
    driverAtPlaceStatus: 'На месте в магазине',
    orderPrepared: 'Заказ собран магазином',
    paymentConfirmation: 'Магазин получил заказ и проверяет оплату.'
  },
  flowers: {
    place: 'Цветочный магазин',
    placeLower: 'цветочный магазин',
    placeAccusative: 'цветочный магазин',
    placePrepositional: 'цветочном магазине',
    placeInstrumental: 'цветочным магазином',
    placeGenitive: 'цветочного магазина',
    placeDative: 'цветочному магазину',
    item: 'Товар', itemLower: 'товар', items: 'Товары', itemGenitive: 'товара', addItem: 'Добавить товар',
    driverRoute: 'Еду в цветочный магазин', driverRouteAction: 'Поехать в цветочный магазин',
    driverArrival: 'Я в цветочном магазине', driverAtPlaceStatus: 'На месте в цветочном магазине',
    orderPrepared: 'Заказ собран цветочным магазином', paymentConfirmation: 'Магазин получил заказ и проверяет оплату.'
  },
  gifts: {
    place: 'Магазин подарков', placeLower: 'магазин подарков', placeAccusative: 'магазин подарков',
    placePrepositional: 'магазине подарков', placeInstrumental: 'магазином подарков',
    placeGenitive: 'магазина подарков', placeDative: 'магазину подарков',
    item: 'Товар', itemLower: 'товар', items: 'Товары', itemGenitive: 'товара', addItem: 'Добавить товар',
    driverRoute: 'Еду в магазин подарков', driverRouteAction: 'Поехать в магазин подарков',
    driverArrival: 'Я в магазине подарков', driverAtPlaceStatus: 'На месте в магазине подарков',
    orderPrepared: 'Заказ собран магазином', paymentConfirmation: 'Магазин получил заказ и проверяет оплату.'
  },
  household: {
    place: 'Хозяйственный магазин', placeLower: 'хозяйственный магазин', placeAccusative: 'хозяйственный магазин',
    placePrepositional: 'хозяйственном магазине', placeInstrumental: 'хозяйственным магазином',
    placeGenitive: 'хозяйственного магазина', placeDative: 'хозяйственному магазину',
    item: 'Товар', itemLower: 'товар', items: 'Товары', itemGenitive: 'товара', addItem: 'Добавить товар',
    driverRoute: 'Еду в хозяйственный магазин', driverRouteAction: 'Поехать в хозяйственный магазин',
    driverArrival: 'Я в хозяйственном магазине', driverAtPlaceStatus: 'На месте в хозяйственном магазине',
    orderPrepared: 'Заказ собран магазином', paymentConfirmation: 'Магазин получил заказ и проверяет оплату.'
  },
  pharmacy: {
    place: 'Аптека', placeLower: 'аптека', placeAccusative: 'аптеку', placePrepositional: 'аптеке',
    placeInstrumental: 'аптекой', placeGenitive: 'аптеки', placeDative: 'аптеке',
    item: 'Товар', itemLower: 'товар', items: 'Товары', itemGenitive: 'товара', addItem: 'Добавить товар',
    driverRoute: 'Еду в аптеку', driverRouteAction: 'Поехать в аптеку', driverArrival: 'Я в аптеке',
    driverAtPlaceStatus: 'На месте в аптеке', orderPrepared: 'Заказ собран аптекой',
    paymentConfirmation: 'Аптека получила заказ и проверяет оплату.'
  }
};

export const normalizeBusinessType = (value: unknown): BusinessType => {
  if (value === 'coffee_shop' || value === 'coffee') return 'coffee_shop';
  if (value === 'confectionery' || value === 'bakery') return 'confectionery';
  if (isBusinessType(value)) return value;
  return DEFAULT_BUSINESS_TYPE;
};

export const getBusinessTerms = (value: unknown): BusinessTerms =>
  BUSINESS_TERMINOLOGY[normalizeBusinessType(value)];
