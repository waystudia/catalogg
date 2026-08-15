const clientRootPath = '/';

export const resolveCityPickerReturnTo = (returnTo: string | null | undefined) => {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.startsWith('/city')) {
    return clientRootPath;
  }

  return returnTo;
};

export const buildCityPickerPath = (returnTo: string) => {
  const safeReturnTo = resolveCityPickerReturnTo(returnTo);
  return safeReturnTo === clientRootPath
    ? '/city'
    : `/city?returnTo=${encodeURIComponent(safeReturnTo)}`;
};

export const getRestaurantClientBackFallback = (restaurantSlug: string, pathname: string) => {
  const base = `/r/${restaurantSlug}`;
  if (pathname.includes('/payment/confirm')) return `${base}/payment`;
  if (pathname.includes('/address') || pathname.endsWith('/payment')) return `${base}/checkout`;
  if (pathname.includes('/checkout')) return `${base}/cart`;
  if (pathname.includes('/cart') || pathname.includes('/reviews')) return base;
  if (pathname.includes('/order/')) return '/profile/orders';
  return '/restaurants';
};
