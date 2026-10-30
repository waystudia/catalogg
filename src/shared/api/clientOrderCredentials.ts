/** Guest credentials are scoped to one order, never inferred from an order id. */
export function getGuestOrderTrackingToken(orderId: string): string {
  if (typeof window === 'undefined' || !orderId) return '';
  const key = `waycatalog-order-tracking:${orderId}`;
  try { return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || ''; }
  catch { try { return window.sessionStorage.getItem(key) || ''; } catch { return ''; } }
}
