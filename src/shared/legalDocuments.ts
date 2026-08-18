export const legalDocumentReleases = {
  user_agreement: {
    version: '2.0',
    publishedAt: '2026-08-06',
    sha256: 'a6d0e28e0abb186ee879339a4a2b624eb6d99a5ca2fc8d3362b5ca12b9cca8b0'
  },
  restaurant_offer: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: '6a43ac2c59af2526dbdf1e3668ab0c2d75d768fefb0d0adbc17c482f1ed7f43c'
  },
  driver_offer: {
    version: '2.0',
    publishedAt: '2026-08-06',
    sha256: '0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f'
  },
  driver_consent: {
    version: '1.0',
    publishedAt: '2026-07-31',
    sha256: 'd69209f4c9829694f512d4da6c0947d6a5bbaf0d5c15b84068d42360d9bdbb39'
  },
  client_consent: {
    version: '1.0',
    publishedAt: '2026-07-31',
    sha256: '582d9449295f5b3dfb786d00cd5fa9781057b31fc99e9fdf24c491129640b4de'
  },
  advertising_consent: {
    version: '1.0',
    publishedAt: '2026-07-31',
    sha256: '8b9026b9d5f2c9598c16f7785efb714face8862108e1e58f6a778ad202d7487e'
  },
  cookie_policy: {
    version: '1.0',
    publishedAt: '2026-07-31'
  }
} as const;

export const LEGAL_VERSION = legalDocumentReleases.user_agreement.version;

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
  partnerOffer: legalDocumentUrl('09-restaurant-offer'),
  driverOffer: legalDocumentUrl('10-driver-offer'),
  index: legalDocumentUrl('index')
} as const;
