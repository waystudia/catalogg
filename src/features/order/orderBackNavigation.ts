import type { NavigateFunction } from 'react-router-dom';

export function returnFromPublicOrder(navigate: NavigateFunction, state: unknown, catalogSlug: string) {
  const origin = state as { ordersOriginKey?: unknown; ordersOriginPath?: unknown } | null;
  const originKey = origin?.ordersOriginKey;
  try {
    if (typeof originKey === 'string' && window.sessionStorage.getItem(`wayyaam:orders-return:${originKey}`) !== null) {
      const source = origin?.ordersOriginPath;
      const path = typeof source === 'string' && (source === '/profile/orders' || source.startsWith('/profile/orders?')) ? source : '/profile/orders';
      navigate(path, { replace: true, state: { restoreScrollY: Number(window.sessionStorage.getItem(`wayyaam:orders-return:${originKey}`)) || 0 } });
      return;
    }
  } catch {
    // Fall back safely when session storage is unavailable.
  }
  navigate(`/${catalogSlug}`, { replace: true });
}
