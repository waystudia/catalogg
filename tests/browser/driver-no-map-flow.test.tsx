import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { MemoryRouter } from 'react-router-dom';
import { render } from 'vitest-browser-react';
import { DriverActiveScreen } from '../../src/pages/driver/DriverApp';
import type { DeliveryOffer } from '../../src/shared/api/deliveryApi';

const delivery = (id: string, confirmed: boolean): DeliveryOffer => ({
  businessType: 'coffee_shop',
  deliveryId: id,
  orderId: `order-${id}`,
  orderNumber: confirmed ? '#1843' : '#1842',
  createdAt: '2026-09-14T01:30:00.000Z',
  itemsCount: 3,
  orderTotal: 1240,
  paymentLabel: 'Оплачено онлайн',
  restaurantLogoUrl: '',
  routeEtaMin: 14,
  paymentMethod: 'bank_transfer',
  restaurantPaymentConfirmed: true,
  pickupQrConfirmed: true,
  restaurantName: 'Кофейня «Город»',
  restaurantAddress: 'ул. Лесная, 12',
  deliveryAddress: 'ул. Садовая, 8, кв. 25',
  deliveryFee: 240,
  distanceKm: 8.4,
  status: 'arrived_to_client',
  isAssignedToViewer: true,
  itemsVisible: true,
  routeToRestaurantUrl: '',
  routeToClientUrl: '',
  restaurantLat: 43.322,
  restaurantLng: 45.705,
  deliveryLat: 43.318123,
  deliveryLng: 45.698456,
  clientName: 'Иван Петров',
  clientPhone: '+7 915 123-45-67',
  driverHandedToClientAt: confirmed ? '2026-09-14T02:00:00.000Z' : null,
  clientReceivedAt: confirmed ? '2026-09-14T02:01:00.000Z' : null
});

test('renders the no-map handoff and swipe-completion flow', async () => {
  window.localStorage.removeItem('wayyaam-navigator-launched:handoff');
  window.localStorage.setItem('wayyaam-navigator-launched:confirmed', 'true');
  await page.viewport(920, 1040);
  const screen = await render(
    <MemoryRouter>
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 390px)', alignItems: 'start', gap: 24, padding: 24, background: '#eef1f7' }}>
        <section className="driver-app"><div className="driver-phone"><DriverActiveScreen delivery={delivery('handoff', false)} /></div></section>
        <section className="driver-app"><div className="driver-phone"><DriverActiveScreen delivery={delivery('confirmed', true)} /></div></section>
      </main>
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('button', { name: /Открыть маршрут в Навигаторе/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Отдал заказ' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Вернуться в Навигатор/ })).toBeVisible();
  await expect.element(screen.getByRole('slider', { name: 'Сдвиньте вправо, чтобы завершить заказ' })).toBeVisible();
  await page.screenshot({ path: '../../output/wayyaam-driver-no-map-flow.png' });
});
