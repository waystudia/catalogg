import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { HashRouter, Route, Routes, useParams } from 'react-router-dom';
import { App } from './app/App';
import { CatalogAdminApp } from './pages/catalog-admin/CatalogAdminApp';
import { Home } from './pages/Home';
import { LoginPage } from './pages/login/LoginPage';
import { PlatformAdminApp } from './pages/platform-admin/PlatformAdminApp';
import { PrivacyPage } from './pages/privacy/PrivacyPage';
import { ScannerPage } from './pages/scanner/ScannerPage';
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

function CatalogAdminRoute() {
  const { slug = '' } = useParams();
  return <CatalogAdminApp slug={decodeURIComponent(slug)} />;
}

function DriverRoute() {
  return <Home />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/scanner" element={<ScannerPage />} />
        <Route path="/:slug/scanner" element={<ScannerPage />} />
        <Route path="/admin/catalogs/:slug" element={<CatalogAdminRoute />} />
        <Route path="/admin/*" element={<PlatformAdminApp />} />
        <Route path="/driver/*" element={<DriverRoute />} />
        <Route path="/:slug/*" element={<App />} />
        <Route path="/:slug" element={<App />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
