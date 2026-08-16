import type { NavigateFunction } from 'react-router-dom';

const exactRouteBackStateKey = '__wayyaamExactRouteBack';

type ExactRouteBackState = {
  scope: string;
  fromPath: string;
};

type RouterState = Record<string, unknown> & {
  [exactRouteBackStateKey]?: ExactRouteBackState;
};

const asRouterState = (value: unknown): RouterState =>
  value && typeof value === 'object' ? value as RouterState : {};

const pathBelongsToScope = (path: string, scope: string) => {
  const [kind, slug] = scope.split(':');
  if (!slug) return false;
  const root = kind === 'business' ? `/business/${slug}` : kind === 'restaurant' ? `/${slug}` : '';
  return Boolean(root && (path === root || path.startsWith(`${root}/`)));
};

export const buildExactRouteBackState = (state: unknown, scope: string, fromPath: string): RouterState => ({
  ...asRouterState(state),
  [exactRouteBackStateKey]: { scope, fromPath }
});

export const hasExactRouteBackOrigin = (state: unknown, scope: string) => {
  const origin = asRouterState(state)[exactRouteBackStateKey];
  return Boolean(origin && origin.scope === scope && pathBelongsToScope(origin.fromPath, scope));
};

export const navigateWithExactRouteBack = (
  navigate: NavigateFunction,
  target: string,
  scope: string,
  fromPath: string,
  state?: unknown
) => navigate(target, { state: buildExactRouteBackState(state, scope, fromPath) });

export const navigateExactRouteBackOrFallback = (
  navigate: NavigateFunction,
  fallback: string,
  scope: string,
  state: unknown
) => {
  if (hasExactRouteBackOrigin(state, scope)) {
    navigate(-1);
    return;
  }
  navigate(fallback, { replace: true });
};

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

export const hasPreviousAppHistoryEntry = (state: unknown) => {
  if (!state || typeof state !== 'object' || !('idx' in state)) return false;
  return typeof state.idx === 'number' && state.idx > 0;
};

export const navigateBackOrFallback = (
  navigate: NavigateFunction,
  fallback: string,
  historyState: unknown = typeof window === 'undefined' ? null : window.history.state
) => {
  if (hasPreviousAppHistoryEntry(historyState)) {
    navigate(-1);
    return;
  }
  navigate(fallback, { replace: true });
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
