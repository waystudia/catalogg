import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render } from 'vitest-browser-react';
import { DeliveryTrackingMap } from '../../src/shared/DeliveryTrackingMap';
import {
  DriverActiveScreen,
  DriverRouteLegProgress,
  DriverYandexNavigationActions
} from '../../src/pages/driver/DriverApp';
import type { DeliveryOffer } from '../../src/shared/api/deliveryApi';

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

  await expect.element(screen.getByText('3,5 км')).toBeVisible();
  await expect.element(screen.getByText('8 мин')).toBeVisible();
  await expect.element(screen.getByTestId('delivery-road-route')).toHaveStyle({ zIndex: '2' });
  await screen.getByRole('button', { name: 'Спутник' }).click();
  await expect.element(screen.getByRole('button', { name: 'Спутник' })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByText(/Esri/)).toBeVisible();
  expect(loadRoute).toHaveBeenCalledOnce();
});

test('keeps navigation controls compact and separates compass from driver follow mode', async () => {
  const onRouteSummaryChange = vi.fn();
  const loadRoute = vi.fn(async () => ({
    distanceM: 32_200,
    durationS: 2_340,
    geometry: [restaurant, client],
    nextManeuver: {
      distanceM: 332,
      instruction: 'Поверните направо',
      street: 'улица Бамат-Гирей-Хаджи'
    }
  }));
  const screen = await render(
    <main className="driver-app">
      <section className="driver-phone--map">
        <DeliveryTrackingMap
          restaurant={restaurant}
          client={client}
          driver={{ ...restaurant, label: 'Моё местоположение' }}
          routePoints={[restaurant, client]}
          loadRoute={loadRoute}
          initialStyle="satellite"
          navigationMode
          followDriverHeading
          onRouteSummaryChange={onRouteSummaryChange}
        />
      </section>
    </main>
  );

  await expect.element(screen.getByRole('img', { name: 'Поворот направо' })).toBeVisible();
  await expect.element(screen.getByText('332 м', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Через 332 м')).not.toBeInTheDocument();
  await expect.element(screen.getByText('улица Бамат-Гирей-Хаджи')).toBeVisible();
  await expect.element(screen.getByText('Поверните направо')).not.toBeInTheDocument();
  await expect.element(screen.getByText('32,2 км')).not.toBeInTheDocument();
  await expect.element(screen.getByText('39 мин')).not.toBeInTheDocument();
  const clientMarker = screen.getByRole('button', { name: 'Клиент: Клиент' });
  await expect.element(clientMarker).toBeVisible();
  const clientMarkerElement = clientMarker.element();
  const mapRotatorElement = clientMarkerElement.parentElement;
  const clientMarkerIcon = clientMarkerElement.querySelector('svg');
  expect(mapRotatorElement).not.toBeNull();
  expect(clientMarkerIcon).not.toBeNull();
  const getRotation = (element: Element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
  };
  const mapRotation = getRotation(mapRotatorElement!);
  const visibleMarkerRotation = mapRotation + getRotation(clientMarkerElement) + getRotation(clientMarkerIcon!);
  expect(Math.abs(mapRotation)).toBeGreaterThan(1);
  expect(Math.abs(visibleMarkerRotation)).toBeLessThan(0.5);
  await expect.element(screen.getByRole('button', { name: 'Переключить на схему' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Выровнять карту по компасу' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Следить за водителем' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Включить голосовые подсказки' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Определить местоположение' })).not.toBeInTheDocument();
  const maneuver = screen.getByLabelText('Следующая подсказка маршрута').element();
  const maneuverIcon = screen.getByRole('img', { name: 'Поворот направо' }).element();
  const maneuverDistance = screen.getByText('332 м', { exact: true }).element();
  const maneuverStreet = screen.getByText('улица Бамат-Гирей-Хаджи').element();
  expect(Math.abs(maneuverIcon.getBoundingClientRect().top - maneuverDistance.getBoundingClientRect().top)).toBeLessThan(3);
  expect(maneuverStreet.getBoundingClientRect().left).toBeLessThanOrEqual(maneuverIcon.getBoundingClientRect().left + 1);
  expect(maneuverStreet.getBoundingClientRect().right).toBeGreaterThanOrEqual(maneuverDistance.getBoundingClientRect().right - 1);
  expect(getComputedStyle(maneuverIcon).color).toBe('rgb(255, 255, 255)');
  expect(getComputedStyle(maneuverDistance).fontWeight).toBe('900');
  expect(getComputedStyle(maneuverStreet).fontWeight).toBe('800');
  expect(maneuver.getBoundingClientRect().height).toBeLessThanOrEqual(80);

  await screen.getByRole('button', { name: 'Переключить на схему' }).click();
  await expect.element(screen.getByRole('button', { name: 'Переключить на спутник' })).toBeVisible();
  await screen.getByRole('button', { name: 'Включить голосовые подсказки' }).click();
  await expect.element(screen.getByRole('button', { name: 'Выключить голосовые подсказки' })).toHaveAttribute('aria-pressed', 'true');
  const mapCanvas = maneuver.closest<HTMLElement>('.delivery-tracking-map__canvas');
  const getMapZoom = () => Number.parseFloat(mapCanvas?.dataset.mapZoom ?? '0');
  expect(getMapZoom()).toBeGreaterThan(0);
  await screen.getByRole('button', { name: 'Отдалить' }).click();
  await screen.getByRole('button', { name: 'Отдалить' }).click();
  const zoomedOutLevel = getMapZoom();
  await screen.getByRole('button', { name: 'Следить за водителем' }).click();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const midAnimationLevel = getMapZoom();
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  const followedLevel = getMapZoom();
  expect(midAnimationLevel).toBeGreaterThan(zoomedOutLevel);
  expect(midAnimationLevel).toBeLessThan(followedLevel);
  expect(onRouteSummaryChange).toHaveBeenCalledWith({ distanceM: 32_200, durationS: 2_340 });
});

test('keeps a wide upright restaurant destination label the same size while zooming', async () => {
  const screen = await render(
    <main className="driver-app">
      <section className="driver-phone--map">
        <DeliveryTrackingMap
          restaurant={{ ...restaurant, label: 'Мангал' }}
          client={client}
          driver={{ ...restaurant, label: 'Моё местоположение' }}
          routePoints={[restaurant, client]}
          loadRoute={async () => ({
            distanceM: 3_000,
            durationS: 360,
            geometry: [restaurant, client]
          })}
          initialStyle="satellite"
          navigationMode
          followDriverHeading
        />
      </section>
    </main>
  );

  const restaurantMarker = screen.getByRole('button', { name: 'Ресторан: Мангал' });
  await expect.element(restaurantMarker.getByText('Мангал')).toBeVisible();
  await expect.element(restaurantMarker.getByText('Ресторан')).toBeVisible();
  const readMarkerSize = () => {
    const style = getComputedStyle(restaurantMarker.element());
    return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
  };
  const initialSize = readMarkerSize();
  expect(initialSize.width).toBeGreaterThanOrEqual(80);
  expect(initialSize.height).toBeGreaterThanOrEqual(40);

  await screen.getByRole('button', { name: 'Отдалить' }).click();
  await screen.getByRole('button', { name: 'Отдалить' }).click();
  const zoomedOutSize = readMarkerSize();
  expect(zoomedOutSize.width).toBe(initialSize.width);
  expect(zoomedOutSize.height).toBe(initialSize.height);
});

test('shows route progress for the current restaurant or client leg', async () => {
  const restaurantLeg = await render(
    <DriverRouteLegProgress
      activeLeg="restaurant"
      restaurantName="Мангал"
      clientName="дукхвах"
      totalDistanceM={5_000}
      remainingDistanceM={3_000}
      remainingDurationS={600}
    />
  );

  await expect.element(restaurantLeg.getByText('Моё местоположение')).toBeVisible();
  await expect.element(restaurantLeg.getByText('Мангал')).toBeVisible();
  await expect.element(restaurantLeg.getByText('Всего 5,0 км')).toBeVisible();
  await expect.element(restaurantLeg.getByText('Осталось 3,0 км')).toBeVisible();
  await expect.element(restaurantLeg.getByText('≈ 10 мин')).toBeVisible();
  await expect.element(restaurantLeg.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await cleanup();

  const clientLeg = await render(
    <DriverRouteLegProgress
      activeLeg="client"
      restaurantName="Мангал"
      clientName="дукхвах"
      totalDistanceM={8_000}
      remainingDistanceM={2_000}
      remainingDurationS={240}
    />
  );

  await expect.element(clientLeg.getByText('Мангал')).toBeVisible();
  await expect.element(clientLeg.getByText('дукхвах')).toBeVisible();
  await expect.element(clientLeg.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
});

test('shows an assigned order detail in the same accepted-delivery card used on the home screen', async () => {
  const delivery: DeliveryOffer = {
    deliveryId: 'delivery-1',
    orderId: 'order-1',
    orderNumber: 'M6714',
    createdAt: '2026-07-31T10:00:00.000Z',
    itemsCount: 3,
    orderTotal: 1760,
    paymentLabel: 'Наличными',
    restaurantLogoUrl: '',
    routeEtaMin: 20,
    paymentMethod: 'cash',
    restaurantPaymentConfirmed: true,
    pickupQrConfirmed: false,
    restaurantName: 'Мангал',
    restaurantAddress: 'ул. Центральная, 12',
    deliveryAddress: 'Цоци-Юрт, ул. Ленина, 1',
    deliveryFee: 200,
    distanceKm: 32.2,
    status: 'assigned',
    isAssignedToViewer: true,
    itemsVisible: true,
    routeToRestaurantUrl: 'https://yandex.ru/maps/?rtext=~43.322,45.705',
    routeToClientUrl: 'https://yandex.ru/maps/?rtext=~43.318123,45.698456',
    restaurantLat: restaurant.lat,
    restaurantLng: restaurant.lng,
    deliveryLat: client.lat,
    deliveryLng: client.lng,
    clientName: 'дукхвах',
    clientPhone: '+7 (928) 886-54-70',
    pickupQrToken: 'token'
  };
  const screen = await render(
    <MemoryRouter>
      <DriverActiveScreen delivery={delivery} />
    </MemoryRouter>
  );

  const card = screen.getByRole('region', { name: 'Текущая доставка M6714' });
  await expect.element(card).toHaveClass(/driver-current-block/);
  await expect.element(card.getByText('✓ ЗАКАЗ ПРИНЯТ')).toBeVisible();
  await expect.element(card.getByText('Точка А')).toBeVisible();
  await expect.element(card.getByText('Точка Б')).toBeVisible();
  await expect.element(card.getByText('Ваш заработок')).toBeVisible();
  await expect.element(card.getByText('200 ₽')).toBeVisible();
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

  const clientRoute = handedOverScreen.getByRole('link', { name: 'Построить маршрут к клиенту' });
  await expect.element(clientRoute).toHaveClass(/driver-secondary--map-hint/);
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
  await expect.element(clientOnlyScreen.getByRole('link', { name: 'Построить маршрут к клиенту' })).toHaveAttribute(
    'href',
    'yandexmaps://maps.yandex.ru/?rtext=~43.318123%2C45.698456&rtt=auto'
  );
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
