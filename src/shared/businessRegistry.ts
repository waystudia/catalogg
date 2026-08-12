export const BUSINESS_TYPES = [
  'restaurant',
  'coffee_shop',
  'confectionery',
  'grocery',
  'flowers',
  'gifts',
  'household',
  'pharmacy'
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type BusinessTypeAvailability = 'active' | 'disabled' | 'compliance_blocked';

export type BusinessTypeDefinition = {
  readonly code: BusinessType;
  readonly label: string;
  readonly emoji: string;
  readonly availability: BusinessTypeAvailability;
};

export const BUSINESS_TYPE_DEFINITIONS: ReadonlyArray<BusinessTypeDefinition> = [
  { code: 'restaurant', label: 'Ресторан', emoji: '🍽', availability: 'active' },
  { code: 'coffee_shop', label: 'Кофейня', emoji: '☕', availability: 'active' },
  { code: 'confectionery', label: 'Кондитерская', emoji: '🍰', availability: 'active' },
  { code: 'grocery', label: 'Продуктовый магазин', emoji: '🛒', availability: 'active' },
  { code: 'flowers', label: 'Цветочный магазин', emoji: '💐', availability: 'disabled' },
  { code: 'gifts', label: 'Магазин подарков', emoji: '🎁', availability: 'disabled' },
  { code: 'household', label: 'Хозяйственный магазин', emoji: '🧹', availability: 'disabled' },
  { code: 'pharmacy', label: 'Аптека', emoji: '💊', availability: 'compliance_blocked' }
];

export const isBusinessType = (value: unknown): value is BusinessType =>
  typeof value === 'string' && BUSINESS_TYPES.some((code) => code === value);

export const getBusinessTypeDefinition = (value: unknown): BusinessTypeDefinition =>
  BUSINESS_TYPE_DEFINITIONS.find(({ code }) => code === value) ?? BUSINESS_TYPE_DEFINITIONS[0];

export const getSelectableBusinessTypes = (): ReadonlyArray<BusinessTypeDefinition> =>
  BUSINESS_TYPE_DEFINITIONS.filter(({ availability }) => availability === 'active');
