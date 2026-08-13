export const buildClientHomeUrl = () => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}#/`;
};

export const redirectToClientHome = () => {
  if (typeof window === 'undefined') return;
  window.location.replace(buildClientHomeUrl());
};

const normalizeRoleAppPath = (path: string) => path.startsWith('/') ? path : `/${path}`;

export const buildRoleAppUrl = (path: string) => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const normalizedPath = normalizeRoleAppPath(path);
  return `${base}#${normalizedPath}`;
};

export const buildProfileLoginPath = (returnTo = '/profile') => {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/profile';
  return `/profile?login=1&returnTo=${encodeURIComponent(safeReturnTo)}`;
};

const roleAppRoutePattern = /^\/(?:admin(?:\/|$)|driver(?:\/|$)|business\/|restaurant\/activation(?:\/|$)|[^/]+\/(?:dashboard|orders|dishes|settings|scanner|pos|payments)(?:\/|$))/;

export const resolveProfileLoginTarget = (redirect: string, requestedReturnTo: string) => {
  if (redirect === '/admin') return '/admin/clients';
  if (redirect !== '/profile') return redirect;

  const safeReturnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/profile';
  return roleAppRoutePattern.test(safeReturnTo) ? '/profile' : safeReturnTo;
};

export const redirectToRoleApp = (path: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.history.replaceState(window.history.state, '', buildRoleAppUrl(path));
  } catch {
    window.location.replace(buildRoleAppUrl(path));
  }
  window.location.reload();
};
