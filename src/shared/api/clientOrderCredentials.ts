const clientSessionStorageKey = 'waycatalog-client-session';
const guestTrackingStoragePrefix = 'waycatalog-order-tracking:';

export const getStoredClientSessionToken = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(clientSessionStorageKey) ?? '';
};

export const saveGuestOrderTrackingToken = (orderId: string, token: string) => {
  if (typeof window === 'undefined' || !orderId || !token) return;
  const key = `${guestTrackingStoragePrefix}${orderId}`;
  try {
    window.localStorage.setItem(key, token);
  } catch {
    window.sessionStorage.setItem(key, token);
  }
};

export const getGuestOrderTrackingToken = (orderId: string) => {
  if (typeof window === 'undefined' || !orderId) return '';
  const key = `${guestTrackingStoragePrefix}${orderId}`;
  try {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? '';
  } catch {
    return window.sessionStorage.getItem(key) ?? '';
  }
};

export const clientOrderCredentialKeys = {
  session: clientSessionStorageKey
} as const;
