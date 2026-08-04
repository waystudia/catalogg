import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { cabins, categories, products, restaurant, themeSettings } from '../../src/data/catalog';
import { ExistingRestaurantSettingsPage } from '../../src/features/restaurant-admin/ExistingRestaurantSettingsPage';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import { DEFAULT_PHOTO_QUALITY_SETTINGS } from '../../src/shared/photoQuality';

test('current admin reuses the existing settings without a second login', async () => {
  const screen = await render(
    <ExistingRestaurantSettingsPage
      catalogSlug="mangal"
      restaurant={restaurant}
      categories={categories}
      cabins={[]}
      tags={[]}
      products={products}
      theme={themeSettings}
      photoQuality={DEFAULT_PHOTO_QUALITY_SETTINGS}
      paymentSettings={defaultPaymentSettings}
      deliverySettings={defaultRestaurantDeliverySettings}
      onSaveRestaurant={vi.fn()}
      onSaveCategories={vi.fn()}
      onSaveCabins={vi.fn()}
      onSaveTags={vi.fn()}
      onSaveTheme={vi.fn()}
      onSavePhotoQuality={vi.fn()}
      onSavePayments={vi.fn()}
      onSaveDelivery={vi.fn()}
      onImport={vi.fn()}
      onSignOut={vi.fn()}
    />
  );

  await expect.element(screen.getByRole('heading', { name: 'Настройки ресторана' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Профиль' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Зал' })).toBeVisible();
  await expect.element(screen.getByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Профиль' }).click();
  await expect.element(screen.getByText('Название ресторана', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Вернуться к настройкам' }).click();
  await screen.getByRole('button', { name: 'Платежи' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Реквизиты для перевода' })).toBeVisible();
});

test('restaurant owner opens seating settings and edits a table used by POS', async () => {
  const onSaveCabins = vi.fn();
  const screen = await render(
    <ExistingRestaurantSettingsPage
      catalogSlug="mangal"
      restaurant={restaurant}
      categories={categories}
      cabins={cabins}
      tags={[]}
      products={products}
      theme={themeSettings}
      photoQuality={DEFAULT_PHOTO_QUALITY_SETTINGS}
      paymentSettings={defaultPaymentSettings}
      deliverySettings={defaultRestaurantDeliverySettings}
      onSaveRestaurant={vi.fn()}
      onSaveCategories={vi.fn()}
      onSaveCabins={onSaveCabins}
      onSaveTags={vi.fn()}
      onSaveTheme={vi.fn()}
      onSavePhotoQuality={vi.fn()}
      onSavePayments={vi.fn()}
      onSaveDelivery={vi.fn()}
      onImport={vi.fn()}
      onSignOut={vi.fn()}
    />
  );

  await screen.getByRole('button', { name: 'Зал' }).click();
  await expect.element(screen.getByRole('button', { name: 'Редактировать Стол 1', exact: true })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Редактировать Кабинка №1', exact: true })).toBeVisible();

  await screen.getByRole('button', { name: 'Редактировать Стол 1', exact: true }).click();
  await screen.getByLabelText('Название места').fill('Стол 15');
  await screen.getByRole('button', { name: 'Сохранить изменения' }).click();

  expect(onSaveCabins).toHaveBeenCalledOnce();
  const savedPlaces = onSaveCabins.mock.calls[0][0] as typeof cabins;
  expect(savedPlaces).toHaveLength(cabins.length + 12);
  expect(savedPlaces.some((place) => place.title === 'Стол 15' && JSON.parse(place.feature).kind === 'table')).toBe(true);
});

test('restaurant owner saves an optional cabin price in the existing cabin settings', async () => {
  const onSaveCabins = vi.fn();
  const screen = await render(
    <ExistingRestaurantSettingsPage
      catalogSlug="mangal"
      restaurant={restaurant}
      categories={categories}
      cabins={cabins}
      tags={[]}
      products={products}
      theme={themeSettings}
      photoQuality={DEFAULT_PHOTO_QUALITY_SETTINGS}
      paymentSettings={defaultPaymentSettings}
      deliverySettings={defaultRestaurantDeliverySettings}
      onSaveRestaurant={vi.fn()}
      onSaveCategories={vi.fn()}
      onSaveCabins={onSaveCabins}
      onSaveTags={vi.fn()}
      onSaveTheme={vi.fn()}
      onSavePhotoQuality={vi.fn()}
      onSavePayments={vi.fn()}
      onSaveDelivery={vi.fn()}
      onImport={vi.fn()}
      onSignOut={vi.fn()}
    />
  );

  await screen.getByRole('button', { name: 'Зал' }).click();
  await screen.getByRole('button', { name: 'Редактировать Кабинка №1' }).click();
  await screen.getByLabelText('Цена кабинки').fill('750');
  await screen.getByRole('button', { name: 'Сохранить изменения' }).click();

  expect(onSaveCabins).toHaveBeenCalledOnce();
  const savedCabins = onSaveCabins.mock.calls[0][0] as typeof cabins;
  const savedCabin = savedCabins.find((place) => place.id === cabins[0].id);
  expect(JSON.parse(savedCabin?.feature ?? '{}')).toMatchObject({ kind: 'cabin', price: 750 });
});
