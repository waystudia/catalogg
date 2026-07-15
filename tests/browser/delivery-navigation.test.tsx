import { expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { DeliveryTrackingMap } from '../../src/shared/DeliveryTrackingMap';
import { DriverYandexNavigationActions } from '../../src/pages/driver/DriverApp';

const restaurant = {
  lat: 43.322,
  lng: 45.705,
  label: 'Rizih',
  address: 'пр-т Путина, 20'
};

const client = {
  lat: 43.318123,
  lng: 45.698456,
  label: 'Клиент',
  address: 'ул. Ленина, 123'
};

const navigationDelivery = (status: 'assigned' | 'arrived_to_restaurant' | 'handed_over') => ({
  status,
  restaurantAddress: restaurant.address,
  restaurantLat: restaurant.lat,
  restaurantLng: restaurant.lng,
  deliveryAddress: client.address,
  deliveryLat: client.lat,
  deliveryLng: client.lng
});

test('switches between street and labeled satellite maps and shows a routed summary', async () => {
  const loadRoute = vi.fn(async () => ({
    distanceM: 3450,
    durationS: 482,
    geometry: [restaurant, { lat: 43.32, lng: 45.701 }, client]
  }));
  const screen = await render(
    <DeliveryTrackingMap
      restaurant={restaurant}
      client={client}
      routePoints={[restaurant, client]}
      loadRoute={loadRoute}
    />
  );

  await expect.element(screen.getByText('3,5 км · 8 мин')).toBeVisible();
  await expect.element(screen.getByTestId('delivery-road-route')).toHaveStyle({ zIndex: '2' });
  await screen.getByRole('button', { name: 'Спутник' }).click();
  await expect.element(screen.getByRole('button', { name: 'Спутник' })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByText(/Esri/)).toBeVisible();
  expect(loadRoute).toHaveBeenCalledOnce();
});

test('reveals Yandex restaurant navigation before pickup and client navigation after handoff', async () => {
  const assignedScreen = await render(
    <DriverYandexNavigationActions delivery={navigationDelivery('assigned')} />
  );

  await assignedScreen.getByRole('button', { name: 'Использовать Яндекс Карты' }).click();
  await expect.element(assignedScreen.getByRole('link', { name: 'Маршрут до ресторана' })).toHaveAttribute('aria-current', 'step');
  await expect.element(assignedScreen.getByRole('button', { name: 'Маршрут до клиента — после получения заказа' })).toBeDisabled();
  await cleanup();

  const handedOverScreen = await render(
    <DriverYandexNavigationActions delivery={navigationDelivery('handed_over')} />
  );

  await handedOverScreen.getByRole('button', { name: 'Использовать Яндекс Карты' }).click();
  const clientRoute = handedOverScreen.getByRole('link', { name: 'Маршрут до клиента' });
  await expect.element(clientRoute).toHaveAttribute('aria-current', 'step');
  await expect.element(clientRoute).toHaveAttribute(
    'href',
    'yandexmaps://maps.yandex.ru/?rtext=~43.318123%2C45.698456&rtt=auto'
  );
  await cleanup();

  const clientOnlyScreen = await render(
    <DriverYandexNavigationActions
      delivery={{
        ...navigationDelivery('handed_over'),
        restaurantLat: null,
        restaurantLng: null
      }}
    />
  );
  await clientOnlyScreen.getByRole('button', { name: 'Использовать Яндекс Карты' }).click();
  await expect.element(clientOnlyScreen.getByRole('link', { name: 'Маршрут до клиента' })).toHaveAttribute('aria-current', 'step');
});

test('offers manual pickup confirmation when the driver reached the restaurant', async () => {
  const confirmPickup = vi.fn(async () => undefined);
  const screen = await render(
    <DriverYandexNavigationActions
      delivery={navigationDelivery('arrived_to_restaurant')}
      onConfirmPickup={confirmPickup}
    />
  );

  await screen.getByRole('button', { name: 'Я взял заказ' }).click();
  expect(confirmPickup).toHaveBeenCalledOnce();
});
