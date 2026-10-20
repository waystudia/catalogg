import type { NavigateFunction } from 'react-router-dom';

export function returnFromPublicOrder(navigate: NavigateFunction, state: unknown, catalogSlug: string) {
  const originKey = (state as { ordersOriginKey?: unknown } | null)?.ordersOriginKey;
  try {
    if (typeof originKey === 'string' && window.sessionStorage.getItem(`wayyaam:orders-return:${originKey}`) !== null) {
      navigate(-1);
      return;
    }
  } catch {
    // Fall back safely when session storage is unavailable.
  }
  navigate(`/${catalogSlug}`);
}
