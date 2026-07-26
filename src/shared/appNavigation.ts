export const buildClientHomeUrl = () => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}#/`;
};

export const redirectToClientHome = () => {
  if (typeof window === 'undefined') return;
  window.location.replace(buildClientHomeUrl());
};
