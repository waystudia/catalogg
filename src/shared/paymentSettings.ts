export type PaymentRequisiteType = 'phone' | 'card' | 'account';
export type PaymentStatus = 'unpaid' | 'awaiting' | 'confirmed' | 'declined';

export type RestaurantPaymentSettings = {
  transferEnabled: boolean;
  requisiteType: PaymentRequisiteType;
  transferNumber: string;
  bankName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  displayName: string;
  qrUrl: string;
  comment: string;
  allowCash: boolean;
  requireConfirmation: boolean;
};

export const defaultPaymentSettings: RestaurantPaymentSettings = {
  transferEnabled: false,
  requisiteType: 'phone',
  transferNumber: '',
  bankName: '',
  lastName: '',
  firstName: '',
  middleName: '',
  displayName: '',
  qrUrl: '',
  comment: 'Оплата заказа переводом ресторану',
  allowCash: true,
  requireConfirmation: true
};

const paymentSettingsKey = (slug: string) => `waycatalog:${slug}:payment-settings`;
const paymentStatusKey = (slug: string, orderId: string) => `waycatalog:${slug}:order-payment:${orderId}`;

export function loadPaymentSettings(slug: string): RestaurantPaymentSettings {
  try {
    const stored = localStorage.getItem(paymentSettingsKey(slug));
    return stored ? { ...defaultPaymentSettings, ...JSON.parse(stored) } : defaultPaymentSettings;
  } catch {
    return defaultPaymentSettings;
  }
}

export function savePaymentSettings(slug: string, settings: RestaurantPaymentSettings) {
  localStorage.setItem(paymentSettingsKey(slug), JSON.stringify(settings));
}

export function loadPaymentStatus(slug: string, orderId: string): PaymentStatus {
  const stored = localStorage.getItem(paymentStatusKey(slug, orderId));
  return stored === 'awaiting' || stored === 'confirmed' || stored === 'declined' || stored === 'unpaid'
    ? stored
    : 'unpaid';
}

export function savePaymentStatus(slug: string, orderId: string, status: PaymentStatus) {
  localStorage.setItem(paymentStatusKey(slug, orderId), status);
}
