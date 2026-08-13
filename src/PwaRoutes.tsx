import { lazy } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { PwaHomeRouteBase } from './PwaHomeRoute';
import { buildProfileLoginPath } from './shared/appNavigation';
export { PwaResumeTracker } from './PwaHomeRoute';

const App = lazy(() => import('./app/App').then((module) => ({ default: module.App })));
const ClientPlatformApp = import.meta.env.MODE === 'test'
  ? () => null
  : lazy(() =>
      import('./pages/client-platform/ClientPlatformApp').then((module) => ({ default: module.ClientPlatformApp }))
    );
const CatalogAdminApp = lazy(() =>
  import('./pages/catalog-admin/CatalogAdminApp').then((module) => ({ default: module.CatalogAdminApp }))
);

export function CatalogAdminRoute() {
  const { slug = '' } = useParams();
  return <CatalogAdminApp slug={decodeURIComponent(slug)} />;
}

export function BusinessAdminRoute() {
  const { slug = '' } = useParams();
  return <CatalogAdminApp slug={decodeURIComponent(slug)} />;
}

export function RestaurantRouteRedirect() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const cleanSlug = decodeURIComponent(slug);
  const suffix = location.pathname.replace(/^\/r\/[^/]+/, '');

  return <Navigate replace to={`/${cleanSlug}${suffix}${location.search}`} />;
}

export function RestaurantPublicRoute() {
  return <App />;
}

export function PwaHomeRoute() {
  return <PwaHomeRouteBase homeElement={<ClientPlatformApp />} />;
}

export function LegacyLoginRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate replace to={buildProfileLoginPath(searchParams.get('returnTo') ?? '/profile')} />;
}
