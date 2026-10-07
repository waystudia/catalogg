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
  it('orders the driver home screen as current delivery, urgent offer, and compact remainder', () => {
    const current = driverSource.indexOf('Текущая доставка');
    const urgent = driverSource.indexOf('<DriverIncomingOrderPanel');
    const others = driverSource.indexOf('Новые заказы');

    assert.ok(current >= 0, 'current delivery is missing');
    assert.ok(urgent > current, 'urgent offer must follow the current delivery');
    assert.ok(others > urgent, 'compact offer list must follow the urgent offer');
    assert.match(driverSource, /Ещё \{hiddenOffersCount\} заказ/);
    const homeScreen = driverSource.slice(
      driverSource.indexOf('function DriverHomeScreen'),
      driverSource.indexOf('function DriverIncomingOrderPanel')
    );
    assert.doesNotMatch(homeScreen, /driver-today-strip/);
  });

  it('renders the approved dark driver mode with an explicit offline entry point', () => {
    assert.match(driverSource, /driver-app driver-app--night/);
    assert.match(driverSource, /driver-offline-hero/);
    assert.match(driverSource, /Вы не в сети/);
    assert.match(driverSource, /Включите статус, чтобы получать заказы/);
    assert.match(driverSource, /'В сеть'/);
    assert.doesNotMatch(driverSource, /На линии/);
    assert.match(driverSource, /driver-orders-tabs/);
    assert.match(driverSource, /Новые/);
    assert.match(driverSource, /В работе/);
    assert.match(driverCss, /\.driver-app--night/);
    assert.match(driverCss, /--driver-night:\s*#050d1b/);
    assert.match(driverCss, /\.driver-online-cta/);
    assert.match(driverSource, /driver-current-block--home/);
    assert.match(driverSource, /recentDeliveryIds\.has\(offer\.deliveryId\)/);
    assert.match(driverCss, /\.driver-current-block--home/);
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
    assert.match(currentPanel, /driver-current-block--home/);
    assert.match(currentPanel, /driver-current-block__home-action/);
    assert.match(currentPanel, /<Link[\s\S]*to="\/driver\/active"/);
    assert.match(currentPanel, /Открыть заказ/);
    assert.match(driverSource, /driver-active-order-card/);
    assert.doesNotMatch(driverSource, /api\.qrserver\.com/);
    assert.doesNotMatch(currentPanel, /deliveryStatusLabels\[offer\.status\]/);
    assert.match(driverCss, /\.driver-current-block--home/);
    assert.match(driverCss, /\.driver-navigator-open/);
    assert.match(driverSource, /<strong>Маршрут<\/strong>/);
    assert.match(driverCss, /\.driver-topbar__actions[\s\S]*gap:\s*4px/);
    assert.match(driverCss, /\.driver-availability-button[\s\S]*min-width:\s*8[0-9]px/);
  });

  it('uses the compact incoming-order layout without delivery-price negotiation', () => {
    const newOrderScreen = driverSource.slice(
      driverSource.indexOf('function DriverNewOrderScreen'),
      driverSource.indexOf('export function DriverActiveScreen')
    );

    assert.match(newOrderScreen, /driver-new-order-screen/);
    assert.match(newOrderScreen, /Стоимость заказа/);
    assert.match(newOrderScreen, /Тип оплаты/);
    assert.match(newOrderScreen, /Принять заказ/);
    assert.match(newOrderScreen, /Отклонить/);
    assert.match(newOrderScreen, /<h1>Новый заказ<\/h1>/);
    assert.match(newOrderScreen, /current > 1 \? current - 1 : 30/);
    assert.doesNotMatch(newOrderScreen, /У вас есть 30 секунд, чтобы принять заказ/);
    assert.doesNotMatch(newOrderScreen, /Предложить свою цену|Согласовать цену|requestDriverDeliveryPrice/);
    assert.match(driverCss, /\.driver-new-order-card/);
  });

  it('opens an accepted delivery at the beginning instead of keeping the offer-list scroll position', () => {
    const activeScreen = driverSource.slice(
      driverSource.indexOf('function DriverActiveScreen'),
      driverSource.indexOf('function DriverQrScreen')
    );

    assert.match(activeScreen, /useLayoutEffect/);
    assert.match(activeScreen, /window\.scrollTo\(\{\s*top:\s*0,\s*left:\s*0,\s*behavior:\s*'auto'\s*\}\)/s);
    assert.match(activeScreen, /\[delivery\?\.deliveryId\]/);
    assert.match(activeScreen, /driver-active-order-card/);
    assert.match(activeScreen, /Для получения заказа/);
    assert.doesNotMatch(activeScreen, /driver-delivery-progress/);
    assert.match(activeScreen, /Получить от клиента/);
    assert.match(activeScreen, /currentDelivery\.paymentMethod === 'cash'/);
    assert.match(activeScreen, /Тип оплаты/);
    assert.match(activeScreen, /Позвонить заведению/);
    assert.match(activeScreen, /Написать клиенту/);
    assert.match(activeScreen, /Контакты заказа/);
    assert.match(activeScreen, /setContactTarget\(isHeadingToRestaurant \? 'restaurant' : 'client'\)/);
    assert.match(activeScreen, /setScreenStatus\(status\)/);
    assert.match(activeScreen, /const nextStop = currentDelivery/);
    assert.match(activeScreen, /hint: 'Для вручения заказа'/);
    assert.match(activeScreen, /'arrived_to_restaurant'/);
    assert.match(driverSource, /<strong>Маршрут<\/strong>/);
  });

  it('keeps a newly accepted delivery on the driver home screen at stage one', () => {
    const incomingPanel = driverSource.slice(
      driverSource.indexOf('function DriverIncomingOrderPanel'),
      driverSource.indexOf('function DriverCurrentDeliveryPanel')
    );
    const currentPanel = driverSource.slice(
      driverSource.indexOf('function DriverCurrentDeliveryPanel'),
      driverSource.indexOf('function DriverStat')
    );
    const activeScreen = driverSource.slice(
      driverSource.indexOf('function DriverActiveScreen'),
      driverSource.indexOf('function DriverQrScreen')
    );

    assert.doesNotMatch(incomingPanel, /navigate\('\/driver\/active'\)/);
    assert.match(incomingPanel, /navigate\('\/driver'/);
    assert.match(currentPanel, /to="\/driver\/active"/);
    assert.match(activeScreen, /<DriverYandexNavigationActions delivery=\{currentDelivery\}/);
    assert.match(activeScreen, /getDriverNextAction\(currentDelivery\.status/);
    assert.doesNotMatch(driverSource, /function DriverMapScreen/);
  });

  it('shows real driver earnings and platform debt as separate balance values', () => {
    assert.match(deliveryApiSource, /debtAmount/);
    assert.match(deliveryApiSource, /debt_amount/);
    assert.match(deliveryApiSource, /get_current_driver_dashboard_profile/);
    assert.match(driverProfileMigration, /'debt_amount',\s*d\.debt_amount/);
    assert.match(driverSource, /Заработано/);
    assert.match(driverSource, /Долг платформе/);
  });

  it('keeps navigation metrics on the map and limits navigation mode to four right-side controls', () => {
    assert.match(mapSource, /delivery-tracking-map__navigation/);
    assert.match(mapSource, /Через/);
    assert.match(mapSource, /navigationMode/);
    assert.match(mapSource, /!navigationMode &&/);
    assert.match(mapCss, /\.delivery-tracking-map__controls button\s*\{[^}]*width:\s*3[0-4]px/s);
    assert.match(mapCss, /\.delivery-tracking-map__attribution\s*\{[^}]*font-size:\s*[5-7]px/s);
  });

  it('uses an external Navigator flow without an embedded driver map', () => {
    assert.match(mapSource, /!navigationMode[\s\S]*delivery-tracking-map__legend/);
    assert.match(mapSource, /Выровнять карту по компасу/);
    assert.match(mapSource, /Следить за водителем/);
    assert.match(mapSource, /Включить голосовые подсказки/);
    assert.match(mapSource, /--map-counter-rotation/);
    assert.match(mapSource, /onRouteSummaryChange/);
    assert.match(mapCss, /\.delivery-tracking-map__tile\s*\{[^}]*transition:\s*none;/s);
    assert.match(mapCss, /\.delivery-tracking-map__canvas\s*\{[^}]*overflow:\s*clip;/s);
    assert.match(mapSource, /getNavigationLookAheadDistanceM\(mapZoomRef\.current\)/);
    assert.match(mapSource, /getNearestEquivalentAngle/);
    assert.match(mapSource, /roadRoute\.nextManeuver\?\.street/);
    assert.match(mapSource, /requestAnimationFrame/);
    assert.doesNotMatch(driverSource, /DriverRouteLegProgress/);
    assert.doesNotMatch(driverSource, /<DeliveryTrackingMap/);
    assert.match(driverSource, /getDriverNavigatorRouteUrl/);
    assert.match(driverSource, /buildYandexNavigatorReturnUrl/);
    assert.match(driverSource, /DriverCompletionSlider/);
    assert.match(driverCss, /\.driver-completion-slider/);
    assert.match(driverSource, /aria-label=\{`Текущая доставка \$\{currentDelivery\.orderNumber\}`\}/);
    assert.match(driverSource, /driver-current-block driver-current-block--details driver-active-order-card/);
  });
});
