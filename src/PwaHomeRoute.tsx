import React from 'react';
import { Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { resolveSessionRedirect } from './shared/api/loginRedirectApi';
import {
  appIsRunningStandalone,
  clearPwaResumePath,
  readPwaResumePath,
  rememberPwaResumePath,
  resolvePwaHomeTarget
} from './shared/pwaSession';

export function PwaResumeTracker() {
  const location = useLocation();

  React.useEffect(() => {
    rememberPwaResumePath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export function PwaHomeRouteBase({ homeElement }: { homeElement: React.ReactNode }) {
  const navigationType = useNavigationType();
  const explicitNavigation = navigationType !== 'POP';
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
      if (targetPath) rememberPwaResumePath(targetPath);
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
  return homeElement;
}
