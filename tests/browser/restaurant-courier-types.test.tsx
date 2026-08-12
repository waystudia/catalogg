import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { DeliverySettingsCard } from '../../src/features/restaurant-settings/DeliverySettingsCard';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings/defaults';
import type { RestaurantCourierService } from '../../src/features/restaurant-settings/DeliverySettingsCard';

const courierService = (): RestaurantCourierService => {
  const couriers: Awaited<ReturnType<RestaurantCourierService['list']>> = [];
  return {
    list: vi.fn(async () => couriers),
    link: vi.fn(async (_catalogSlug, email, courierType) => {
      const courier = { driverId: 'driver-1', name: 'Адам Курьер', email, courierType, isPrimary: false, priority: 10 };
      couriers.push(courier);
      return courier;
    }),
    setType: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined)
  };
};

const renderCourierSettings = async (service = courierService()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <DeliverySettingsCard
        settings={{ ...defaultRestaurantDeliverySettings, use_own_courier: true }}
        catalogSlug="mangal"
        courierService={service}
        onSave={() => undefined}
        onOpenBackup={() => undefined}
        onBack={() => undefined}
      />
    </QueryClientProvider>
  );
  await screen.getByRole('button', { name: 'Курьеры и платформа' }).click();
  return { screen, service };
};

test('restaurant must choose the courier type before adding a courier', async () => {
  const { screen, service } = await renderCourierSettings();

  await expect.element(screen.getByLabelText('Тип курьера')).toHaveValue('');
  await screen.getByLabelText('E-mail водителя').fill('driver@example.com');
  await expect.element(screen.getByRole('button', { name: 'Добавить курьера' })).toBeDisabled();

  await screen.getByLabelText('Тип курьера').selectOptions('independent');
  await expect.element(screen.getByText('Комиссию 30 ₽ за доставку платит водитель')).toBeVisible();
  await screen.getByRole('button', { name: 'Добавить курьера' }).click();

  expect(service.link).toHaveBeenCalledWith('mangal', 'driver@example.com', 'independent');
  await expect.element(screen.getByText('Адам Курьер', { exact: true })).toBeVisible();
  await expect.element(screen.getByLabelText('Условия работы для Адам Курьер')).toHaveValue('independent');
});

test('existing unclassified courier is visibly blocked from new assignments until classified', async () => {
  const service = courierService();
  vi.mocked(service.list).mockResolvedValue([{
    driverId: 'driver-old',
    name: 'Существующий курьер',
    email: 'old@example.com',
    courierType: null,
    isPrimary: false,
    priority: 10
  }]);
  const { screen } = await renderCourierSettings(service);

  await expect.element(screen.getByText('Тип не выбран')).toBeVisible();
  await expect.element(screen.getByText(/нельзя назначать на новые доставки/i)).toBeVisible();
  await screen.getByLabelText('Условия работы для Существующий курьер', { exact: true }).selectOptions('staff_salaried');
  await screen.getByRole('button', { name: 'Сохранить условия для Существующий курьер' }).click();
  expect(service.setType).toHaveBeenCalledWith('mangal', 'driver-old', 'staff_salaried');
});

test('restaurant can change conditions previously saved by the platform admin', async () => {
  const service = courierService();
  vi.mocked(service.list).mockResolvedValue([{
    driverId: 'driver-shared',
    name: 'Общий курьер',
    email: 'shared@example.com',
    courierType: 'independent',
    isPrimary: false,
    priority: 10
  }]);
  const { screen } = await renderCourierSettings(service);

  await screen.getByLabelText('Условия работы для Общий курьер').selectOptions('staff_salaried');
  await screen.getByRole('button', { name: 'Сохранить условия для Общий курьер' }).click();

  expect(service.setType).toHaveBeenCalledWith('mangal', 'driver-shared', 'staff_salaried');
});
