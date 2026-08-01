export const LEGAL_VERSION = '1.0';

export const legalDocumentUrl = (fileName: string) => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}legal/${fileName}.html`;
};

export const legalDocuments = {
  policy: legalDocumentUrl('01-personal-data-policy'),
  agreement: legalDocumentUrl('02-user-agreement'),
  cookies: legalDocumentUrl('03-cookie-policy'),
  clientConsent: legalDocumentUrl('04-client-consent'),
  restaurantConsent: legalDocumentUrl('05-restaurant-consent'),
  driverConsent: legalDocumentUrl('06-driver-consent'),
  advertisingConsent: legalDocumentUrl('07-advertising-consent'),
  orderTransferConsent: legalDocumentUrl('08-order-data-transfer-consent'),
  restaurantOffer: legalDocumentUrl('09-restaurant-offer'),
  driverOffer: legalDocumentUrl('10-driver-offer'),
  index: legalDocumentUrl('index')
} as const;

