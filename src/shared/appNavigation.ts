export const buildClientHomeUrl = () => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}#/`;
};

export const redirectToClientHome = () => {
  if (typeof window === 'undefined') return;
  window.location.replace(buildClientHomeUrl());
};

export const buildRoleAppUrl = (path: string) => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}#${normalizedPath}`;
};

export const redirectToRoleApp = (path: string) => {
  if (typeof window === 'undefined') return;
  window.location.replace(buildRoleAppUrl(path));
};
