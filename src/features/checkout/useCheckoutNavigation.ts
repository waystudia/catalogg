import { useExactBack, useViewNavigate } from '../../shared/ExactBackNavigation';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function useCheckoutNavigation<T extends string>(slug: string, screen: T, setScreen: (screen: T) => void, setCartOpen: (open: boolean) => void, cartOpen = false) {
  const location = useLocation();
  const navigate = useViewNavigate();
  const origin = useRef<{ screen: T; scrollY: number; cartOpen: boolean } | null>(null);
  const wasCheckout = useRef(false);
  const isCheckout = location.pathname === `/${slug}/checkout`;
  const cartRequested = new URLSearchParams(location.search).get('cart') === '1';

  useEffect(() => {
    if (!isCheckout && wasCheckout.current && origin.current) {
      setScreen(origin.current.screen);
      setCartOpen(origin.current.cartOpen);
      const scrollY = origin.current.scrollY;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
    }
    if (!isCheckout && cartRequested) setCartOpen(true);
    wasCheckout.current = isCheckout;
  }, [isCheckout, cartRequested, setCartOpen, setScreen]);

  const openCheckout = () => {
    origin.current = { screen, scrollY: window.scrollY, cartOpen };
    navigate(`/${slug}/checkout`, { state: { checkoutOrigin: location.pathname + location.search, checkoutOriginState: location.state } });
  };
  const goBackFromCheckout = useExactBack(() => {
    const source = (location.state as { checkoutOrigin?: unknown } | null)?.checkoutOrigin;
    if (typeof source === 'string' && (source === `/${slug}` || source.startsWith(`/${slug}?`))) navigate(source, { replace: true, state: (location.state as { checkoutOriginState?: unknown } | null)?.checkoutOriginState });
    else navigate('/cart', { replace: true });
  });
  const closeCart = () => {
    setCartOpen(false);
    if (cartRequested) {
      const source = (location.state as { cartReturn?: unknown } | null)?.cartReturn;
      if (source === '/cart') navigate('/cart', { replace: true });
      else navigate(`/${slug}`, { replace: true });
    }
  };
  const collapseCartToCatalog = () => {
    setCartOpen(false);
    const search = new URLSearchParams(location.search);
    search.delete('cart');
    navigate({ pathname: `/${slug}`, search: search.toString() }, { replace: true, state: location.state });
  };
  return { openCheckout, goBackFromCheckout, closeCart, collapseCartToCatalog };
}
