import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { App } from './app/App';
import { ClientPlatformApp } from './pages/client-platform/ClientPlatformApp';
import { CatalogAdminApp } from './pages/catalog-admin/CatalogAdminApp';
import { appIsRunningStandalone, readPwaResumePath, rememberPwaResumePath, routeIsRoleAppPath } from './shared/pwaSession';

export function CatalogAdminRoute() {
  const { slug = '' } = useParams();
  return <CatalogAdminApp slug={decodeURIComponent(slug)} />;
}

export function RestaurantRouteRedirect() {
  const { slug = '' } = useParams();
  return <Navigate replace to={`/${decodeURIComponent(slug)}`} />;
}

export function RestaurantPublicRoute() {
  return <App />;
}

export function PwaResumeTracker() {
  const location = useLocation();

  React.useEffect(() => {
    rememberPwaResumePath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export function PwaHomeRoute() {
  const resumePath = React.useMemo(
    () => {
      const path = readPwaResumePath();
      if (!path) return null;
      return appIsRunningStandalone() || routeIsRoleAppPath(path) ? path : null;
    },
    []
  );

  return resumePath ? <Navigate replace to={resumePath} /> : <ClientPlatformApp />;
}
