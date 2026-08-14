import { getBusinessTerms, normalizeBusinessType, type BusinessType } from '../shared/businessTerminology';

export type BusinessOrderWorkflow = 'preparation' | 'picking';

export type BusinessOrderCapabilities = {
  readonly businessType: BusinessType;
  readonly workflow: BusinessOrderWorkflow;
  readonly supportsHall: boolean;
  readonly supportsPickup: boolean;
  readonly supportsDelivery: boolean;
  readonly supportsPicking: boolean;
  readonly customerLabel: 'Клиент' | 'Покупатель';
  readonly merchantLabel: string;
  readonly startWorkLabel: string;
  readonly readyLabel: string;
  readonly inProgressStatusLabel: string;
  readonly readyStatusLabel: string;
};

const preparationBusinesses = new Set<BusinessType>(['restaurant', 'coffee_shop', 'confectionery']);

export const getBusinessOrderCapabilities = (value: unknown): BusinessOrderCapabilities => {
  const businessType = normalizeBusinessType(value);
  const terms = getBusinessTerms(businessType);
  const workflow: BusinessOrderWorkflow = preparationBusinesses.has(businessType) ? 'preparation' : 'picking';

  return {
    businessType,
    workflow,
    supportsHall: businessType === 'restaurant' || businessType === 'coffee_shop',
    supportsPickup: true,
    supportsDelivery: true,
    supportsPicking: workflow === 'picking',
    customerLabel: workflow === 'picking' ? 'Покупатель' : 'Клиент',
    merchantLabel: terms.place,
    startWorkLabel: workflow === 'picking' ? 'Начать сборку' : 'Начать готовить',
    readyLabel: workflow === 'picking' ? 'Заказ собран' : 'Заказ готов',
    inProgressStatusLabel: workflow === 'picking' ? 'Собирается' : 'Готовится',
    readyStatusLabel: workflow === 'picking' ? 'Собран' : 'Готов'
  };
};
