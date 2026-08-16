import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { CatalogLoadingScreen } from './shared/CatalogLoadingScreen';
import { LegalSurface } from './shared/LegalSurface';
import { ensurePushServiceWorkerRegistration } from './shared/pushServiceWorker';
import { StorefrontBoundary } from './features/storefront/StorefrontBoundary';
import { ExactScrollRestoration } from './shared/ExactScrollRestoration';
import {
  BusinessAdminRoute,
  CatalogAdminRoute,
  LegacyLoginRedirect,
  PwaHomeRoute,
  PwaResumeTracker,
  RestaurantPublicRoute,
  RestaurantRouteRedirect
} from './PwaRoutes';
import './app/styles.css';
import './features/dish-editor/styles.css';

const appQueryClient = new QueryClient();

const ClientPlatformApp = lazy(() =>
  import('./pages/client-platform/ClientPlatformApp').then((module) => ({ default: module.ClientPlatformApp }))
);
const DriverApp = lazy(() =>
  import('./pages/driver/DriverApp').then((module) => ({ default: module.DriverApp }))
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
const RestaurantActivationPage = lazy(() =>
  import('./features/restaurant-activation/RestaurantActivationPage').then((module) => ({
    default: module.RestaurantActivationPage
  }))
);
const PartnerRegistrationPage = lazy(() =>
  import('./features/partner-registration/PartnerRegistrationPage').then((module) => ({
    default: module.PartnerRegistrationPage
  }))
);
const SellerApplicationPage = lazy(() =>
  import('./features/partner-registration/SellerApplicationPage').then((module) => ({
    default: module.SellerApplicationPage
  }))
);
const ClientPasskeyPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./features/client-pairing/ClientPasskeyPreview').then((module) => ({
        default: module.ClientPasskeyPreview
      })))
  : null;
const SharedProductPreviewPage = import.meta.env.DEV
  ? lazy(() =>
      import('./pages/shared-product-preview/SharedProductPreviewPage').then((module) => ({
        default: module.SharedProductPreviewPage
      })))
  : null;
const RestaurantAdminPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./features/restaurant-admin/RestaurantAdminPreview').then((module) => ({
        default: module.RestaurantAdminPreview
      })))
  : null;
const passkeyPreviewIsActive = import.meta.env.DEV && window.location.hash.startsWith('#/__passkey-preview/');
const restaurantAdminPreviewIsActive = import.meta.env.DEV && window.location.hash.startsWith('#/__restaurant-admin-preview');

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
void ensurePushServiceWorkerRegistration();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <HashRouter>
        <ExactScrollRestoration />
        <PwaResumeTracker />
        <Suspense fallback={<CatalogLoadingScreen />}>
          <StorefrontBoundary>
            <Routes>
              {ClientPasskeyPreview && (
                <Route path="/__passkey-preview/:mode" element={<ClientPasskeyPreview />} />
              )}
              {SharedProductPreviewPage && (
                <Route path="/__shared-product-preview" element={<SharedProductPreviewPage />} />
              )}
              {RestaurantAdminPreview && (
                <Route path="/__restaurant-admin-preview" element={<RestaurantAdminPreview />} />
              )}
              <Route path="/" element={<PwaHomeRoute />} />
              <Route path="/city" element={<ClientPlatformApp />} />
              <Route path="/categories" element={<ClientPlatformApp />} />
              <Route path="/restaurants" element={<ClientPlatformApp />} />
              <Route path="/cart" element={<ClientPlatformApp />} />
              <Route path="/pages/:pageSlug" element={<ClientPlatformApp />} />
              <Route path="/profile/*" element={<ClientPlatformApp />} />
              <Route path="/partner-registration" element={<PartnerRegistrationPage />} />
              <Route path="/partner-registration/documents" element={<SellerApplicationPage />} />
              <Route path="/r/:slug/*" element={<RestaurantRouteRedirect />} />
              <Route path="/login" element={<LegacyLoginRedirect />} />
              <Route path="/restaurant/activation" element={<RestaurantActivationPage />} />
              <Route path="/business/:slug/*" element={<BusinessAdminRoute />} />
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
          </StorefrontBoundary>
          {!passkeyPreviewIsActive && !restaurantAdminPreviewIsActive && <LegalSurface />}
        </Suspense>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
