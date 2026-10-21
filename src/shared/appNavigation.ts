import type { NavigateFunction } from 'react-router-dom';
import { readExactScroll, type ExactScrollPosition } from './exactScrollState';

const exactRouteBackStateKey = '__wayyaamExactRouteBack';
const clientNavigationOriginKey = '__wayyaamClientNavigationOrigin';

type ExactRouteBackState = {
  scope: string;
  fromPath: string;
};

type RouterState = Record<string, unknown> & {
  [exactRouteBackStateKey]?: ExactRouteBackState;
  [clientNavigationOriginKey]?: ClientNavigationOrigin;
};

type ClientNavigationOrigin = {
  path: string;
  scroll: ExactScrollPosition | null;
};

const asRouterState = (value: unknown): RouterState =>
  value && typeof value === 'object' ? value as RouterState : {};

const isSafeClientPath = (path: unknown): path is string =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');

export const buildClientNavigationState = (
  state: unknown,
  path: string,
  scroll: ExactScrollPosition | null = typeof window === 'undefined' ? null : readExactScroll(window.history.state)
): RouterState => ({
  ...asRouterState(state),
  [clientNavigationOriginKey]: { path, scroll }
});

export const getClientNavigationOrigin = (state: unknown): ClientNavigationOrigin | null => {
  const origin = asRouterState(state)[clientNavigationOriginKey];
  if (!origin || !isSafeClientPath(origin.path)) return null;
  const scroll = origin.scroll && Number.isFinite(origin.scroll.x) && Number.isFinite(origin.scroll.y)
    ? { x: Math.max(0, origin.scroll.x), y: Math.max(0, origin.scroll.y) }
    : null;
  return { path: origin.path, scroll };
};

const restoreScrollAfterNavigation = (scroll: ExactScrollPosition | null) => {
  if (!scroll || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'auto' }));
};

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
  return `/profile/cabinet?login=1&returnTo=${encodeURIComponent(safeReturnTo)}`;
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

/**
 * Back from a bottom-navigation destination returns to the tab that opened it.
 * A direct URL still falls back to the destination's safe parent page.
 */
export const navigateClientBackOrFallback = (
  navigate: NavigateFunction,
  fallback: string,
  state: unknown,
  historyState: unknown = typeof window === 'undefined' ? null : window.history.state
) => {
  const origin = getClientNavigationOrigin(state);
  if (origin && hasPreviousAppHistoryEntry(historyState)) {
    navigate(-1);
    return;
  }
  if (origin) {
    navigate(origin.path, { replace: true });
    restoreScrollAfterNavigation(origin.scroll);
    return;
  }
  navigateBackOrFallback(navigate, fallback, historyState);
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
