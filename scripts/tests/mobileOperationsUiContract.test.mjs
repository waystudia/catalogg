import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const driverSource = readFileSync(new URL('../../src/pages/driver/DriverApp.tsx', import.meta.url), 'utf8');
const driverCss = readFileSync(new URL('../../src/pages/driver/driver.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/app/App.tsx', import.meta.url), 'utf8');
const supabaseSource = readFileSync(new URL('../../src/shared/supabase.ts', import.meta.url), 'utf8');
const restaurantSessionSource = readFileSync(
  new URL('../../src/shared/restaurantSession.ts', import.meta.url),
  'utf8'
);
const restaurantOrderPresentation = readFileSync(
  new URL('../../src/features/restaurant-admin/orderPresentation.ts', import.meta.url),
  'utf8'
);
const platformCss = readFileSync(
  new URL('../../src/pages/platform-admin/platform-admin.css', import.meta.url),
  'utf8'
);
const deliveryApiSource = readFileSync(
  new URL('../../src/shared/api/deliveryApi.ts', import.meta.url),
  'utf8'
);
const driverProfileMigration = readFileSync(
  new URL(
    '../../supabase/migrations/20260730205305_add_driver_dashboard_profile_rpc.sql',
    import.meta.url
  ),
  'utf8'
);
const mapSource = readFileSync(
  new URL('../../src/shared/DeliveryTrackingMap.tsx', import.meta.url),
  'utf8'
);
const mapCss = readFileSync(
  new URL('../../src/shared/delivery-tracking-map.css', import.meta.url),
  'utf8'
);

describe('mobile operational interfaces', () => {
  it('orders the driver home screen as stats, current delivery, urgent offer, and compact remainder', () => {
    const stats = driverSource.indexOf('driver-today-strip');
    const current = driverSource.indexOf('Текущая доставка');
    const urgent = driverSource.indexOf('<DriverIncomingOrderPanel');
    const others = driverSource.indexOf('Другие доступные заказы');

    assert.ok(stats >= 0, 'single-row today statistics are missing');
    assert.ok(current > stats, 'current delivery must follow today statistics');
    assert.ok(urgent > current, 'urgent offer must follow the current delivery');
    assert.ok(others > urgent, 'compact offer list must follow the urgent offer');
    assert.match(driverSource, /Ещё \{hiddenOffersCount\} заказ/);
  });

  it('uses a readable left-to-right gradient sweep only on the urgent offer', () => {
    assert.match(driverCss, /\.driver-urgent-offer::before/);
    assert.match(driverCss, /linear-gradient\(\s*90deg/s);
    assert.match(driverCss, /animation:\s*driver-urgent-sweep/);
    assert.match(driverCss, /@keyframes driver-urgent-sweep/);
    assert.match(driverCss, /translateX\(-/);
    assert.match(driverCss, /translateX\(/);
    assert.match(driverCss, /prefers-reduced-motion:\s*reduce/);
  });

  it('keeps the platform More sheet scrollable inside a short mobile viewport', () => {
    assert.match(platformCss, /\.platform-more-sheet__panel\s*\{[^}]*max-height:/s);
    assert.match(platformCss, /\.platform-more-sheet__panel\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(platformCss, /\.platform-more-sheet__panel\s*\{[^}]*overscroll-behavior:\s*contain/s);
  });

  it('waits for restaurant session restoration before deciding to show the login form', () => {
    assert.match(appSource, /adminSessionChecked/);
    assert.match(appSource, /Проверяем вход в ресторан/);
    assert.match(appSource, /adminSessionChecked\s*\?\s*\(/s);
    assert.match(restaurantSessionSource, /RESTAURANT_SESSION_CHECK_TIMEOUT_MS/);
    assert.match(supabaseSource, /settleRestaurantSessionCheck\(resolveAdminSession/);
    assert.match(supabaseSource, /hasAdminSession\(catalogSlug, session\)/);
    assert.match(appSource, /\.catch\(\(error\) => \{[\s\S]*setAdminSessionChecked\(true\)/);
  });

  it('plays a loud melodic restaurant order alert for longer than one second', () => {
    assert.match(restaurantOrderPresentation, /const notes = \[/);
    assert.match(restaurantOrderPresentation, /start:\s*1\.12/);
    assert.match(restaurantOrderPresentation, /peakGain = 0\.34/);
    assert.match(restaurantOrderPresentation, /audio\.currentTime \+ 1\.55/);
  });

  it('makes an accepted delivery and the compact driver controls immediately distinguishable', () => {
    const currentPanel = driverSource.slice(
      driverSource.indexOf('function DriverCurrentDeliveryPanel'),
      driverSource.indexOf('function DriverStat')
    );
    assert.match(driverSource, /driver-current-block__accepted/);
    assert.match(driverSource, /ЗАКАЗ ПРИНЯТ/);
    assert.match(driverSource, /driver-inline-qr/);
    assert.match(driverSource, /Показать QR ресторану/);
    assert.match(driverSource, /Профиль загружается/);
    assert.doesNotMatch(driverSource, /api\.qrserver\.com/);
    assert.doesNotMatch(currentPanel, /deliveryStatusLabels\[offer\.status\]/);
    assert.match(driverCss, /\.driver-current-block__accepted/);
    assert.match(driverCss, /\.driver-inline-qr/);
    assert.match(driverCss, /\.driver-secondary--map-hint/);
    assert.match(driverSource, /Построить маршрут к клиенту/);
    assert.match(
      driverSource,
      /delivery\.status === 'handed_over'[\s\S]*driver-secondary--map-hint/
    );
    assert.match(driverCss, /\.driver-topbar__actions[\s\S]*gap:\s*4px/);
    assert.match(driverCss, /\.driver-availability-button[\s\S]*min-width:\s*6[0-9]px/);
  });

  it('opens an accepted delivery at the beginning instead of keeping the offer-list scroll position', () => {
    const activeScreen = driverSource.slice(
      driverSource.indexOf('function DriverActiveScreen'),
      driverSource.indexOf('function DriverQrScreen')
    );

    assert.match(activeScreen, /useLayoutEffect/);
    assert.match(activeScreen, /window\.scrollTo\(\{\s*top:\s*0,\s*left:\s*0,\s*behavior:\s*'auto'\s*\}\)/s);
    assert.match(activeScreen, /\[delivery\?\.deliveryId\]/);
  });

  it('shows real driver earnings and platform debt as separate balance values', () => {
    assert.match(deliveryApiSource, /debtAmount/);
    assert.match(deliveryApiSource, /debt_amount/);
    assert.match(deliveryApiSource, /get_current_driver_dashboard_profile/);
    assert.match(driverProfileMigration, /'debt_amount',\s*d\.debt_amount/);
    assert.match(driverSource, /Заработано/);
    assert.match(driverSource, /Долг платформе/);
  });

  it('keeps navigation metrics on the map and limits navigation mode to three right-side controls', () => {
    assert.match(mapSource, /delivery-tracking-map__navigation/);
    assert.match(mapSource, /Через/);
    assert.match(mapSource, /navigationMode/);
    assert.match(mapSource, /!navigationMode &&/);
    assert.match(mapCss, /\.delivery-tracking-map__controls button\s*\{[^}]*width:\s*3[0-4]px/s);
    assert.match(mapCss, /\.delivery-tracking-map__attribution\s*\{[^}]*font-size:\s*[5-7]px/s);
  });
});
