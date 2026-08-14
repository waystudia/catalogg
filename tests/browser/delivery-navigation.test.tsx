import { expect, test, vi } from 'vitest';
import { useCallback, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render } from 'vitest-browser-react';
import { DeliveryTrackingMap } from '../../src/shared/DeliveryTrackingMap';
import {
  DriverActiveScreen,
  DriverMapScreen,
  DriverRouteLegProgress,
  DriverYandexNavigationActions
} from '../../src/pages/driver/DriverApp';
import type { DeliveryOffer, DriverProfile } from '../../src/shared/api/deliveryApi';

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

const activeDelivery = (status: DeliveryOffer['status']): DeliveryOffer => ({
  businessType: 'restaurant',
  catalogId: '',
  deliveryId: 'delivery-map-1',
  orderId: 'order-map-1',
  orderNumber: 'M9584',
  createdAt: '2026-08-06T10:40:00.000Z',
  itemsCount: 2,
  orderTotal: 780,
  clientDeliveryFee: 200,
  paymentLabel: 'Наличными',
  restaurantLogoUrl: '',
  routeEtaMin: 10,
  paymentMethod: 'cash',
  restaurantPaymentConfirmed: false,
  restaurantFundsDelivery: false,
  restaurantDeliveryPayoutAmount: 0,
  driverRestaurantOrderPaymentConfirmedAt: null,
  driverRestaurantOrderPaymentAmount: 0,
  driverRestaurantDeliveryPayoutReceivedAt: null,
  driverRestaurantDeliveryPayoutReceivedAmount: 0,
  pickupQrConfirmed: false,
  restaurantName: 'Мангал',
  restaurantAddress: restaurant.address,
  deliveryAddress: client.address,
  deliveryFee: 200,
  distanceKm: 3.3,
  status,
  isAssignedToViewer: true,
  itemsVisible: true,
  routeToRestaurantUrl: 'https://yandex.ru/maps/?rtext=~43.322,45.705',
  routeToClientUrl: 'https://yandex.ru/maps/?rtext=43.322,45.705~43.318123,45.698456',
  restaurantLat: restaurant.lat,
  restaurantLng: restaurant.lng,
  deliveryLat: client.lat,
  deliveryLng: client.lng,
  clientName: 'Клиент',
  clientPhone: '+7 928 000-00-00',
  pickupQrToken: 'token'
});

const driverProfile: DriverProfile = {
  id: 'driver-1',
  name: 'Водитель',
  phone: '+7 928 111-11-11',
  vehicleInfo: 'Автомобиль',
  carNumber: 'А001АА95',
  payoutDetails: '',
  debtAmount: 0,
  photoUrl: '',
  serviceSettlements: ['Курчалой'],
  rating: 5,
  status: 'busy',
  isOnline: true,
  lastLat: 43.319,
  lastLng: 45.699,
  lastLocationAt: '2026-08-06T10:42:00.000Z'
};

test('keeps the driver map on the active leg and lets the driver confirm restaurant arrival there', async () => {
  window.sessionStorage.setItem('driver-restaurant-route-started:delivery-map-1', 'true');
  const onConfirmRestaurantArrival = vi.fn(async () => undefined);
  const screen = await render(
    <MemoryRouter initialEntries={['/driver/map/delivery-map-1']}>
      <main className="driver-app">
        <section className="driver-phone driver-phone--map">
          <DriverMapScreen
            delivery={activeDelivery('assigned')}
            profile={driverProfile}
            onConfirmRestaurantArrival={onConfirmRestaurantArrival}
          />
        </section>
      </main>
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('button', { name: 'Ресторан: Мангал' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Клиент: Клиент' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('link', { name: /Яндекс Карты/u })).toHaveAttribute('target', '_blank');

  await screen.getByRole('button', { name: 'Я в ресторане' }).click();
  expect(onConfirmRestaurantArrival).toHaveBeenCalledWith('delivery-map-1');
});

test('shows the client rather than the restaurant after the driver has picked up the order', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/driver/map/delivery-map-1']}>
      <main className="driver-app">
        <section className="driver-phone driver-phone--map">
          <DriverMapScreen
            delivery={activeDelivery('handed_over')}
            profile={driverProfile}
            onConfirmRestaurantArrival={async () => undefined}
          />
        </section>
      </main>
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('button', { name: 'Клиент: Клиент' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Ресторан: Мангал' })).not.toBeInTheDocument();
});

test('forces a fresh GPS reading and rebuilds the route from the map refresh button', async () => {
  let resolveLocation!: (value: {
    lat: number;
    lng: number;
    accuracyM: number;
    recordedAtMs: number;
  }) => void;
  const onRequestCurrentLocation = vi.fn(() => new Promise<{
    lat: number;
    lng: number;
    accuracyM: number;
    recordedAtMs: number;
  }>((resolve) => {
    resolveLocation = resolve;
  }));
  const screen = await render(
    <MemoryRouter initialEntries={['/driver/map/delivery-map-1']}>
      <main className="driver-app">
        <section className="driver-phone driver-phone--map">
          <DriverMapScreen
            delivery={activeDelivery('assigned')}
            profile={driverProfile}
            onRequestCurrentLocation={onRequestCurrentLocation}
          />
        </section>
      </main>
    </MemoryRouter>
  );

  const refreshButton = screen.getByRole('button', { name: 'Обновить местоположение и маршрут' });
  await refreshButton.click();
  expect(onRequestCurrentLocation).toHaveBeenCalledOnce();
  await expect.element(refreshButton).toHaveAttribute('aria-busy', 'true');
  await expect.element(screen.getByRole('status', { name: 'Статус GPS' })).toHaveTextContent('Обновляем GPS…');

  resolveLocation({ lat: 43.3202, lng: 45.7002, accuracyM: 7.6, recordedAtMs: Date.now() });
  await expect.element(screen.getByRole('status', { name: 'Статус GPS' })).toHaveTextContent('GPS обновлён · ±8 м');
  await expect.element(refreshButton).toHaveAttribute('aria-busy', 'false');
});

const stationaryFixes = [
  { lat: 43, lng: 45, accuracyM: 12, speedMps: 0, heading: null, recordedAtMs: 1_000 },
  { lat: 43.00012, lng: 45.00014, accuracyM: 12, speedMps: 0, heading: 40, recordedAtMs: 6_000 }
] as const;

function StationaryNavigationHarness() {
  const [fixIndex, setFixIndex] = useState(0);
  const [remainingDistanceM, setRemainingDistanceM] = useState<number | null>(null);
  const handleRouteSummaryChange = useCallback((summary: { distanceM: number } | null) => {
    setRemainingDistanceM(summary?.distanceM ?? null);
  }, []);
  const loadStableRoute = useCallback(async () => ({
    distanceM: 1_000,
    durationS: 120,
    geometry: [stationaryFixes[0], { lat: 43, lng: 45.01 }]
  }), []);

  return (
    <>
      <button type="button" onClick={() => setFixIndex(1)}>Следующая GPS-точка</button>
      <DeliveryTrackingMap
        driver={{ ...stationaryFixes[fixIndex], label: 'Моё местоположение' }}
        routePoints={[stationaryFixes[0], { lat: 43, lng: 45.01 }]}
        loadRoute={loadStableRoute}
        navigationMode
        followDriverHeading
        onRouteSummaryChange={handleRouteSummaryChange}
      />
      <output aria-label="Остаток тестового маршрута">{remainingDistanceM?.toFixed(1) ?? '—'}</output>
    </>
  );
}

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
  const roadRouteLayer = screen.getByTestId('delivery-road-route');
  await expect.element(roadRouteLayer).toHaveStyle({ zIndex: '2', overflow: 'visible' });
  await expect.element(roadRouteLayer).toHaveAttribute('overflow', 'visible');
  const fittedClientMarker = screen.getByRole('button', { name: 'Клиент: Клиент' });
  await fittedClientMarker.click();
  await expect.element(screen.getByText(client.address, { exact: true })).toBeVisible();
  await fittedClientMarker.click();
  await expect.element(screen.getByText(client.address, { exact: true })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Спутник' }).click();
  await expect.element(screen.getByRole('button', { name: 'Спутник' })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByText(/Esri/)).toBeVisible();
  expect(loadRoute).toHaveBeenCalledOnce();
});

test('adds an asphalt editor point with a map tap', async () => {
  const onMapClick = vi.fn();
  const screen = await render(
    <DeliveryTrackingMap
      routePoints={[]}
      editorPoints={[]}
      preferAsphaltRoads={false}
      onMapClick={onMapClick}
    />
  );
  await screen.getByLabelText('Поле разметки дороги').click();
  expect(onMapClick).toHaveBeenCalledOnce();
});

test('locates the asphalt editor and opens its map fullscreen', async () => {
  const onMapClick = vi.fn();
  const originalGeolocation = navigator.geolocation;
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({
    coords: {
      latitude: 43.32,
      longitude: 45.70,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    },
    timestamp: Date.now()
  } as GeolocationPosition));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition }
  });

  try {
    const screen = await render(
      <DeliveryTrackingMap enableSearch enableFullscreen preferAsphaltRoads={false} onMapClick={onMapClick} />
    );
    await screen.getByRole('button', { name: 'Моё местоположение' }).click();
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    await expect.element(screen.getByText('Карта перемещена к вашему местоположению.')).toBeVisible();

    const fullscreenButton = screen.getByRole('button', { name: 'Открыть карту на весь экран' });
    await fullscreenButton.click();
    await expect.element(screen.getByRole('button', { name: 'Закрыть полноэкранную карту' })).toBeVisible();
    await screen.getByLabelText('Поле разметки дороги').click();
    expect(onMapClick).toHaveBeenCalledOnce();
  } finally {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: originalGeolocation });
  }
});

test('shows saved asphalt roads as branch references', async () => {
  const screen = await render(
    <DeliveryTrackingMap
      editorReferenceRoutes={[[restaurant, client]]}
      preferAsphaltRoads={false}
    />
  );

  await expect.element(screen.getByTestId('saved-asphalt-road')).toHaveAttribute('points');
});

test('keeps navigation controls compact and separates compass from driver follow mode', async () => {
  const onRouteSummaryChange = vi.fn();
  const onRequestCurrentLocation = vi.fn(async () => ({
    lat: restaurant.lat,
    lng: restaurant.lng,
    accuracyM: 6,
    recordedAtMs: Date.now()
  }));
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
          onRequestCurrentLocation={onRequestCurrentLocation}
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
  const scaleReadout = screen.getByLabelText('Масштаб карты');
  await expect.element(scaleReadout).toBeVisible();
  const initialScaleReadout = scaleReadout.element().textContent;
  await screen.getByRole('button', { name: 'Приблизить' }).click();
  expect(scaleReadout.element().textContent).not.toBe(initialScaleReadout);
  await screen.getByRole('button', { name: 'Отдалить' }).click();
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
  await screen.getByRole('button', { name: 'Приблизить' }).click();
  await screen.getByRole('button', { name: 'Приблизить' }).click();
  const zoomedInLevel = getMapZoom();
  await screen.getByRole('button', { name: 'Следить за водителем' }).click();
  expect(onRequestCurrentLocation).toHaveBeenCalledOnce();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const midAnimationLevel = getMapZoom();
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  const followedLevel = getMapZoom();
  expect(midAnimationLevel).toBeLessThan(zoomedInLevel);
  expect(midAnimationLevel).toBeGreaterThan(followedLevel);
  expect(followedLevel).toBeCloseTo(17.5, 2);
  expect(onRouteSummaryChange).toHaveBeenCalledWith({ distanceM: 32_200, durationS: 2_340 });
});

test('keeps the route facing forward while stationary GPS readings drift inside their accuracy', async () => {
  const screen = await render(<StationaryNavigationHarness />);
  await expect.element(screen.getByLabelText('Следующая подсказка маршрута')).toBeVisible();
  const driverMarker = screen.getByRole('button', { name: 'Водитель: Моё местоположение' });
  const rotator = driverMarker.element().parentElement;
  if (!rotator) throw new Error('Слой поворота карты не найден.');
  const readRotation = () => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(rotator).transform);
    return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
  };
  const initialRotation = readRotation();
  const remainingDistance = screen.getByLabelText('Остаток тестового маршрута');
  await expect.element(remainingDistance).toHaveTextContent('1000.0');

  await screen.getByRole('button', { name: 'Следующая GPS-точка' }).click();
  await new Promise((resolve) => window.setTimeout(resolve, 750));

  expect(Math.abs(readRotation() - initialRotation)).toBeLessThan(5);
  await expect.element(remainingDistance).toHaveTextContent('1000.0');
});

test('keeps a wide upright restaurant destination label the same size while zooming', async () => {
  const screen = await render(
    <main className="driver-app">
      <section className="driver-phone--map">
        <DeliveryTrackingMap
          restaurant={{ ...restaurant, label: 'Мангал' }}
          client={{ ...client, label: 'дукхвах' }}
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
  const clientMarker = screen.getByRole('button', { name: 'Клиент: дукхвах' });
  await expect.element(restaurantMarker.getByText('Мангал')).toBeVisible();
  await expect.element(restaurantMarker.getByText('Ресторан')).toBeVisible();
  expect(clientMarker.element().querySelector('strong')?.textContent).toBe('Клиент');
  expect(clientMarker.element().querySelector('small')?.textContent).toBe('дукхвах');
  const readMarkerSize = (marker: Element) => {
    const style = getComputedStyle(marker);
    return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
  };
  const initialSize = readMarkerSize(restaurantMarker.element());
  expect(initialSize.width).toBeGreaterThanOrEqual(150);
  expect(initialSize.height).toBeGreaterThanOrEqual(50);
  expect(readMarkerSize(clientMarker.element())).toEqual(initialSize);
  for (const label of [restaurantMarker.element(), clientMarker.element()]) {
    const text = label.querySelector<HTMLElement>('.delivery-tracking-map__marker-label');
    expect(text?.scrollWidth).toBeLessThanOrEqual(text?.clientWidth ?? 0);
  }

  await screen.getByRole('button', { name: 'Отдалить' }).click();
  await screen.getByRole('button', { name: 'Отдалить' }).click();
  const zoomedOutSize = readMarkerSize(restaurantMarker.element());
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
  const restaurantProgress = restaurantLeg.getByRole('progressbar');
  await expect.element(restaurantProgress).toHaveAttribute('aria-valuenow', '40');
  const progressElement = restaurantProgress.element();
  const progressBounds = progressElement.getBoundingClientRect();
  const endpointDots = progressElement.querySelectorAll('.driver-map-sheet__leg-progress-endpoint');
  expect(endpointDots).toHaveLength(2);
  const startDotBounds = endpointDots[0].getBoundingClientRect();
  const endDotBounds = endpointDots[1].getBoundingClientRect();
  expect(Math.abs((startDotBounds.left + startDotBounds.width / 2) - progressBounds.left)).toBeLessThan(1);
  expect(Math.abs((endDotBounds.left + endDotBounds.width / 2) - progressBounds.right)).toBeLessThan(1);
  const routePointBlocks = progressElement.closest('.driver-map-sheet__leg')?.querySelectorAll('.driver-map-sheet__leg-points > span');
  expect(routePointBlocks).not.toBeUndefined();
  expect(routePointBlocks).toHaveLength(2);
  expect(Math.abs(routePointBlocks![1].getBoundingClientRect().right - progressBounds.right)).toBeLessThan(3);
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
    businessType: 'restaurant',
    catalogId: '',
    deliveryId: 'delivery-1',
    orderId: 'order-1',
    orderNumber: 'M6714',
    createdAt: '2026-07-31T10:00:00.000Z',
    itemsCount: 3,
    orderTotal: 1760,
    clientDeliveryFee: 200,
    paymentLabel: 'Наличными',
    restaurantLogoUrl: '',
    routeEtaMin: 20,
    paymentMethod: 'cash',
    restaurantPaymentConfirmed: true,
    restaurantFundsDelivery: false,
    restaurantDeliveryPayoutAmount: 0,
    driverRestaurantOrderPaymentConfirmedAt: null,
    driverRestaurantOrderPaymentAmount: 0,
    driverRestaurantDeliveryPayoutReceivedAt: null,
    driverRestaurantDeliveryPayoutReceivedAmount: 0,
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

test('requires the full order amount and a separate restaurant payout for free delivery', async () => {
  const delivery: DeliveryOffer = {
    ...activeDelivery('arrived_to_restaurant'),
    orderTotal: 1500,
    clientDeliveryFee: 0,
    deliveryFee: 200,
    restaurantFundsDelivery: true,
    restaurantDeliveryPayoutAmount: 200
  };
  const screen = await render(
    <MemoryRouter>
      <DriverActiveScreen delivery={delivery} />
    </MemoryRouter>
  );

  await expect.element(screen.getByText(/Передайте ресторану полную стоимость заказа/)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Я передал 1.500 ₽ за заказ/ })).toBeEnabled();
  await expect.element(screen.getByRole('button', { name: /Я получил 200 ₽ за доставку/ })).toBeDisabled();
  await expect.element(screen.getByRole('button', { name: 'QR после расчёта' })).toBeDisabled();
});

test('hides restaurant-funded delivery controls when the client pays for delivery', async () => {
  const delivery: DeliveryOffer = {
    ...activeDelivery('arrived_to_restaurant'),
    orderTotal: 1700,
    clientDeliveryFee: 200,
    deliveryFee: 200,
    restaurantFundsDelivery: false,
    restaurantDeliveryPayoutAmount: 0
  };
  const screen = await render(
    <MemoryRouter>
      <DriverActiveScreen delivery={delivery} />
    </MemoryRouter>
  );

  await expect.element(screen.getByText(/200 ₽ за доставку остаются у вас из суммы клиента/)).toBeVisible();
  await expect.element(screen.getByText('2. Оплата доставки')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: /Я получил 200 ₽ за доставку/ })).not.toBeInTheDocument();
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
