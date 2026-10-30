import { useIsHistoryRestoration } from './shared/ExactBackNavigation';
import React, { lazy } from 'react';
import { Navigate, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { resolveSessionRedirect } from './shared/api/loginRedirectApi';
import {
  appIsRunningStandalone,
  clearPwaResumePath,
  readPwaResumePath,
  rememberPwaResumePath,
  resolvePwaHomeTarget
} from './shared/pwaSession';

const App = lazy(() => import('./app/App').then((module) => ({ default: module.App })));
const ClientPlatformApp = lazy(() =>
  import('./pages/client-platform/ClientPlatformApp').then((module) => ({ default: module.ClientPlatformApp }))
);
const CatalogAdminApp = lazy(() =>
  import('./pages/catalog-admin/CatalogAdminApp').then((module) => ({ default: module.CatalogAdminApp }))
);

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
  const navigationType = useNavigationType();
  const historyRestoration = useIsHistoryRestoration();
  const explicitNavigation = navigationType !== 'POP' || historyRestoration;
  const savedPath = React.useMemo(readPwaResumePath, []);
  const [sessionPath, setSessionPath] = React.useState<string | null>(null);
  const [isSessionChecked, setIsSessionChecked] = React.useState(explicitNavigation);

  React.useEffect(() => {
    if (explicitNavigation) {
      clearPwaResumePath();
      setSessionPath(null);
      setIsSessionChecked(true);
      return undefined;
    }

    let isMounted = true;
    void resolveSessionRedirect().then((redirect) => {
      if (!isMounted) return;
      const verifiedPath = redirect === '/admin' ? '/admin/clients' : redirect;
      const targetPath = resolvePwaHomeTarget({
        explicitNavigation: false,
        savedPath,
        sessionRedirect: verifiedPath,
        standalone: appIsRunningStandalone()
      });
      if (targetPath) {
        rememberPwaResumePath(targetPath);
      }
      setSessionPath(targetPath);
      setIsSessionChecked(true);
    }).catch(() => {
      if (isMounted) setIsSessionChecked(true);
    });

    return () => {
      isMounted = false;
    };
  }, [explicitNavigation, savedPath]);

  if (sessionPath) return <Navigate replace to={sessionPath} />;
  if (!isSessionChecked) return null;
  return <ClientPlatformApp />;
}
