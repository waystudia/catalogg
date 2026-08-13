import { lazy } from 'react';
import { useParams } from 'react-router-dom';
import { PwaHomeRouteBase } from './PwaHomeRoute';
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
  return <ClientPlatformApp />;
}

export function RestaurantPublicRoute() {
  return <App />;
}

export function PwaHomeRoute() {
  return <PwaHomeRouteBase homeElement={<ClientPlatformApp />} />;
}
