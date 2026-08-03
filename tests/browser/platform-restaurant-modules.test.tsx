import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PlatformRestaurantModulesPage } from '../../src/features/platform-admin-modules/PlatformRestaurantModulesPage';
import type {
  RestaurantModuleEntitlement,
  RestaurantModuleRestaurant
} from '../../src/shared/api/restaurantModulesApi';

const restaurant = (overrides: Partial<RestaurantModuleRestaurant> = {}): RestaurantModuleRestaurant => ({
  catalogId: 'catalog-mangal',
  name: 'Мангал',
  slug: 'mangal',
  planCode: 'basic',
  subscriptionStatus: 'active',
  subscriptionEndsAt: '2026-09-03T12:00:00.000Z',
  ...overrides
});

test('super admin chooses a package, overrides a module and saves restaurant limits', async () => {
  await page.viewport(1280, 900);
  const saveEntitlement = vi.fn(async (value: RestaurantModuleEntitlement) => value);
  const screen = await render(
    <PlatformRestaurantModulesPage
      onBack={() => undefined}
      loadRestaurants={async () => [restaurant()]}
      loadEntitlements={async () => []}
      saveEntitlement={saveEntitlement}
    />
  );

  await expect.element(screen.getByRole('heading', { name: 'Модули ресторанов' })).toBeVisible();
  await expect.element(screen.getByText('Мангал')).toBeVisible();
  await screen.getByRole('button', { name: 'Настроить Мангал' }).click();

  await screen.getByLabelText('Пакет Мангал').selectOptions('pos_warehouse');
  await expect.element(screen.getByLabelText('POS', { exact: true })).toBeChecked();
  await expect.element(screen.getByLabelText('Склад', { exact: true })).toBeChecked();
  await expect.element(screen.getByLabelText('Техкарты', { exact: true })).toBeChecked();
  await expect.element(screen.getByLabelText('Финансы', { exact: true })).not.toBeChecked();

  await screen.getByLabelText('Техкарты', { exact: true }).click();
  await screen.getByLabelText('Кассиры').fill('5');
  await screen.getByLabelText('Устройства').fill('3');
  await screen.getByRole('button', { name: 'Сохранить доступ' }).click();

  expect(saveEntitlement).toHaveBeenCalledWith({
    catalogId: 'catalog-mangal',
    packageCode: 'pos_warehouse',
    posEnabled: true,
    warehouseEnabled: true,
    recipesEnabled: false,
    financeEnabled: false,
    promotionsEnabled: false,
    loyaltyEnabled: false,
    maxCashiers: 5,
    maxDevices: 3,
    maxLocations: 1,
    maxWarehouses: 0
  });
  await expect.element(screen.getByText('Доступ сохранён')).toBeVisible();
});

test('existing restaurant starts on the safe basic package when no entitlement exists', async () => {
  await page.viewport(1280, 900);
  const screen = await render(
    <PlatformRestaurantModulesPage
      onBack={() => undefined}
      loadRestaurants={async () => [restaurant({ subscriptionStatus: 'expired' })]}
      loadEntitlements={async () => []}
      saveEntitlement={async (value) => value}
    />
  );

  await expect.element(screen.getByText('Базовый')).toBeVisible();
  await expect.element(screen.getByText('Просмотр без операций')).toBeVisible();
  await expect.element(screen.getByText('0 из 6 модулей')).toBeVisible();
});
