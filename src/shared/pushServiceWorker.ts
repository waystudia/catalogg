declare global {
  interface Window {
    __WAYYAAM_PWA_RETIREMENT__?: Promise<boolean>;
  }
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

const normalizedBasePath = () => import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const registerPushServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;

  const canRegister = await window.__WAYYAAM_PWA_RETIREMENT__;
  if (canRegister === false) return null;

  const basePath = normalizedBasePath();
  return navigator.serviceWorker.register(`${basePath}sw.js?mode=push`, {
    scope: basePath
  });
};

export const ensurePushServiceWorkerRegistration = () => {
  if (registrationPromise) return registrationPromise;

  registrationPromise = registerPushServiceWorker().catch(() => {
    registrationPromise = null;
    return null;
  });
  return registrationPromise;
};
