import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from 'vitest-browser-react';
import { DriverActiveScreen } from '../../src/pages/driver/DriverApp';
import * as deliveryApi from '../../src/shared/api/deliveryApi';
import type { DeliveryOffer } from '../../src/shared/api/deliveryApi';

vi.mock('../../src/shared/api/deliveryApi', { spy: true });

const delivery = (overrides: Partial<DeliveryOffer> = {}): DeliveryOffer => ({
  businessType: 'restaurant', deliveryId: 'swipe-regression', orderId: 'order-1',
  orderNumber: 'M6714', createdAt: '2026-07-31T10:00:00.000Z', itemsCount: 1,
  orderTotal: 1000, paymentLabel: 'Переводом', paymentMethod: 'bank_transfer',
  restaurantLogoUrl: '', routeEtaMin: 20, restaurantPaymentConfirmed: true,
  pickupQrConfirmed: false, restaurantName: 'Мангал', restaurantAddress: 'ул. Лесная, 12',
  deliveryAddress: 'ул. Мира, 1', deliveryFee: 200, distanceKm: 2,
  routeToRestaurantUrl: 'https://yandex.ru/maps/?rtext=~43.1,45.1',
  routeToClientUrl: 'https://yandex.ru/maps/?rtext=~43.2,45.2',
  restaurantLat: 43.1, restaurantLng: 45.1, deliveryLat: 43.2, deliveryLng: 45.2,
  status: 'assigned', isAssignedToViewer: true, itemsVisible: true,
  ...overrides
});

test('starts the next action on the left after confirming arrival', async () => {
  vi.mocked(deliveryApi.updateDeliveryProgress).mockResolvedValueOnce(undefined);
  const screen = await render(<MemoryRouter><DriverActiveScreen delivery={delivery({ pickupQrConfirmed: true })} /></MemoryRouter>);
  const arrival = screen.getByRole('button', { name: /Я в ресторане.*Проведите/ });
  await arrival.click();
  arrival.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const pickup = screen.getByRole('button', { name: /Забрал заказ.*Проведите/ });
  await expect.element(pickup).toBeVisible();
  expect((pickup.element() as HTMLElement).style.getPropertyValue('--driver-swipe-offset')).toBe('0px');
  expect(deliveryApi.updateDeliveryProgress).toHaveBeenCalledWith('swipe-regression', 'arrived_to_restaurant');
});

test('shows pickup only after QR confirmation and cash confirmation when required', async () => {
  const screen = await render(<MemoryRouter><DriverActiveScreen delivery={delivery({ status: 'arrived_to_restaurant' })} /></MemoryRouter>);
  await expect.element(screen.getByText('Показать QR ресторану')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Забрал заказ.*Проведите/ })).not.toBeInTheDocument();
  await screen.rerender(<MemoryRouter><DriverActiveScreen delivery={delivery({ status: 'arrived_to_restaurant', pickupQrConfirmed: true, paymentMethod: 'cash', restaurantPaymentConfirmed: false })} /></MemoryRouter>);
  await expect.element(screen.getByRole('button', { name: /Забрал заказ.*Проведите/ })).not.toBeInTheDocument();
  await screen.rerender(<MemoryRouter><DriverActiveScreen delivery={delivery({ status: 'arrived_to_restaurant', pickupQrConfirmed: true, paymentMethod: 'cash', restaurantPaymentConfirmed: true })} /></MemoryRouter>);
  await expect.element(screen.getByRole('button', { name: /Забрал заказ.*Проведите/ })).toBeVisible();
});

test('returns the slider to the left and permits retry after a failed status update', async () => {
  vi.mocked(deliveryApi.updateDeliveryProgress).mockRejectedValueOnce(new Error('Нет связи')).mockResolvedValueOnce(undefined);
  const screen = await render(<MemoryRouter><DriverActiveScreen delivery={delivery()} /></MemoryRouter>);
  const arrival = screen.getByRole('button', { name: /Я в ресторане.*Проведите/ });
  arrival.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await expect.element(screen.getByText('Нет связи')).toBeVisible();
  await vi.waitFor(() => expect((arrival.element() as HTMLElement).style.getPropertyValue('--driver-swipe-offset')).toBe('0px'));
  arrival.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await expect.element(screen.getByText('Показать QR ресторану')).toBeVisible();
});
