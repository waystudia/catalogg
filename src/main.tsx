import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { CatalogLoadingScreen } from './shared/CatalogLoadingScreen';
import {
  CatalogAdminRoute,
  PwaHomeRoute,
  PwaResumeTracker,
  RestaurantPublicRoute,
  RestaurantRouteRedirect
} from './PwaRoutes';
import './app/styles.css';
import './features/dish-editor/styles.css';

const ClientPlatformApp = lazy(() =>
  import('./pages/client-platform/ClientPlatformApp').then((module) => ({ default: module.ClientPlatformApp }))
);
const DriverApp = lazy(() =>
  import('./pages/driver/DriverApp').then((module) => ({ default: module.DriverApp }))
);
const LoginPage = lazy(() =>
  import('./pages/login/LoginPage').then((module) => ({ default: module.LoginPage }))
);
const PlatformAdminApp = lazy(() =>
  import('./pages/platform-admin/PlatformAdminApp').then((module) => ({ default: module.PlatformAdminApp }))
);
const PrivacyPage = lazy(() =>
  import('./pages/privacy/PrivacyPage').then((module) => ({ default: module.PrivacyPage }))
);
const PaymentsPage = lazy(() =>
  import('./pages/payments/PaymentsPage').then((module) => ({ default: module.PaymentsPage }))
);
const ScannerPage = lazy(() =>
  import('./pages/scanner/ScannerPage').then((module) => ({ default: module.ScannerPage }))
);

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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <PwaResumeTracker />
      <Suspense fallback={<CatalogLoadingScreen />}>
        <Routes>
          <Route path="/" element={<PwaHomeRoute />} />
          <Route path="/city" element={<ClientPlatformApp />} />
          <Route path="/categories" element={<ClientPlatformApp />} />
          <Route path="/restaurants" element={<ClientPlatformApp />} />
          <Route path="/cart" element={<ClientPlatformApp />} />
          <Route path="/profile/*" element={<ClientPlatformApp />} />
          <Route path="/r/:slug/*" element={<RestaurantRouteRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/scanner" element={<ScannerPage />} />
          <Route path="/:slug/scanner" element={<ScannerPage />} />
          <Route path="/admin/catalogs/:slug" element={<CatalogAdminRoute />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/*" element={<PlatformAdminApp />} />
          <Route path="/driver/*" element={<DriverApp />} />
          <Route path="/:slug/*" element={<RestaurantPublicRoute />} />
          <Route path="/:slug" element={<RestaurantPublicRoute />} />
        </Routes>
      </Suspense>
    </HashRouter>
  </React.StrictMode>
);
