import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { shouldResolveCustomStorefront } from '../../entities/storefront';
import { getPublicStorefrontByHostname } from '../../shared/api/storefrontApi';
import { applyStorefrontRuntimeBrand } from '../../shared/storefrontRuntime';
import { CatalogLoadingScreen } from '../../shared/CatalogLoadingScreen';
import { StorefrontContextValue } from './storefrontContext';

const canOpenOnExclusiveStorefront = (pathname: string, slug: string) => {
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return true;
  if (pathname === `/r/${slug}` || pathname.startsWith(`/r/${slug}/`)) return true;
  return pathname === '/login'
    || pathname.startsWith('/profile')
    || pathname === '/privacy'
    || pathname.startsWith('/pages/');
};

function UnconfiguredStorefront() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f8fc' }}>
      <section style={{ width: 'min(100%, 420px)', textAlign: 'center' }}>
        <h1>Домен ещё не подключён</h1>
        <p>Проверьте адрес или обратитесь к администратору магазина.</p>
      </section>
    </main>
  );
}

export function StorefrontBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
  const isCustomDomain = shouldResolveCustomStorefront(hostname);
  const storefrontQuery = useQuery({
    queryKey: ['public-storefront', hostname],
    queryFn: () => getPublicStorefrontByHostname(hostname),
    enabled: isCustomDomain,
    staleTime: 5 * 60_000,
    retry: 1
  });
  const storefront = storefrontQuery.data ?? null;

  useEffect(() => {
    if (storefront) applyStorefrontRuntimeBrand(storefront);
  }, [storefront]);

  if (isCustomDomain && storefrontQuery.isPending) return <CatalogLoadingScreen />;
  if (isCustomDomain && (!storefront || storefrontQuery.error)) return <UnconfiguredStorefront />;
  if (
    storefront?.storefrontMode === 'exclusive'
    && !canOpenOnExclusiveStorefront(location.pathname, storefront.catalogSlug)
  ) {
    return <Navigate replace to={`/${storefront.catalogSlug}`} />;
  }

  return (
    <StorefrontContextValue.Provider value={{ isCustomDomain, storefront }}>
      {children}
    </StorefrontContextValue.Provider>
  );
}
