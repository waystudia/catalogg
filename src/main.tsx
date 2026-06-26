import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { PlatformAdminApp } from './pages/platform-admin/PlatformAdminApp';
import './app/styles.css';
import './features/dish-editor/styles.css';

let reloadingForUpdate = false;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = () => {
      void registration.update();
    };

    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    });
    window.setInterval(checkForUpdate, 10 * 60 * 1000);
  }
});

const restoreGitHubPagesRedirect = () => {
  try {
    const redirect = window.sessionStorage.getItem('catalogg:redirect');
    if (!redirect) return;

    window.sessionStorage.removeItem('catalogg:redirect');
    const normalizedBase = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    const nextPath = `${normalizedBase.replace(/\/$/, '')}${redirect}`;
    window.history.replaceState(null, '', nextPath);
  } catch {
    // Session storage can be unavailable in strict/private browser modes.
  }
};

restoreGitHubPagesRedirect();

const isPlatformAdminRoute = window.location.pathname
  .replace(import.meta.env.BASE_URL, '/')
  .startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isPlatformAdminRoute ? <PlatformAdminApp /> : <App />}
  </React.StrictMode>
);
