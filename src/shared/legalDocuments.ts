export const legalDocumentReleases = {
  user_agreement: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: '3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972'
  },
  restaurant_offer: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: '6a43ac2c59af2526dbdf1e3668ab0c2d75d768fefb0d0adbc17c482f1ed7f43c'
  },
  driver_offer: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: 'b64b00570e8c52cafa76b531f97637d121d8db22770d6e01261139906a104e2f'
  },
  driver_consent: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: 'b2b3a117ac0ed8aed794db4f4cb3b7555a7fced40109d07d3f36f790b48c4fd6'
  },
  client_consent: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: 'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e'
  },
  advertising_consent: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: '749116fa765a5cc8d040d4157ccfa0e52cdedf8cb9680cd7b6cae4266a80bd97'
  },
  order_transfer_consent: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: 'b8526c815a6919a1b5df1f7bd7d7182de46fe9ff0d245026fd5262828f8645e7'
  },
  restaurant_consent: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: 'e811cadaf55734e20135ef28f3975d15a109dbb0d0a2929ad0a1320b0f70a8fd'
  },
  cookie_policy: {
    version: '3.0',
    publishedAt: '2026-08-18',
    sha256: '57ccf19c8531654868a2982a024ed722f90ef80d1f7d66cce8914c8b3d971fd2'
  }
} as const;

export const LEGAL_VERSION = legalDocumentReleases.user_agreement.version;

export const legalDocumentUrl = (fileName: string) => {
  const configuredBase = import.meta.env?.BASE_URL ?? '/';
  const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
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
