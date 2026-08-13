import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { cabins, categories, products, restaurant, themeSettings } from '../../src/data/catalog';
import { groceryCategories, groceryProducts, groceryRestaurant, groceryTheme } from '../../src/data/groceryCatalog';
import { ExistingRestaurantSettingsPage } from '../../src/features/restaurant-admin/ExistingRestaurantSettingsPage';
import { SettingsHub, defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import { DEFAULT_PHOTO_QUALITY_SETTINGS } from '../../src/shared/photoQuality';

const settingsHubCallbacks = () => ({
  onProfile: vi.fn(),
  onDesign: vi.fn(),
  onCategories: vi.fn(),
  onSeating: vi.fn(),
  onPayments: vi.fn(),
  onImport: vi.fn(),
  onDelivery: vi.fn(),
  onLogout: vi.fn(),
  onActivate: vi.fn()
});

test('restaurant owner starts activation from settings after testing the cabinet', async () => {
  const callbacks = settingsHubCallbacks();
  const screen = await render(
    <SettingsHub {...callbacks} activationStatus="legacy_review_required" />
  );

  await expect.element(screen.getByText(/тестовом режиме/i)).toBeVisible();
  await screen.getByRole('button', { name: 'Активировать ресторан' }).click();
  expect(callbacks.onActivate).toHaveBeenCalledOnce();
});

test('active restaurant does not see a repeated activation action', async () => {
  const callbacks = settingsHubCallbacks();
  const screen = await render(
    <SettingsHub {...callbacks} activationStatus="active" />
  );

  await expect.element(screen.getByRole('button', { name: 'Активировать ресторан' })).not.toBeInTheDocument();
});

test('business owner can open password change from the existing settings hub', async () => {
  const callbacks = { ...settingsHubCallbacks(), onPassword: vi.fn() };
  const screen = await render(
    <SettingsHub {...callbacks} activationStatus="active" />
  );

  await screen.getByRole('button', { name: 'Сменить пароль' }).click();
  expect(callbacks.onPassword).toHaveBeenCalledOnce();
});

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

test('grocery settings keep the shared design but remove restaurant-only hall semantics', async () => {
  const onSaveDelivery = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <ExistingRestaurantSettingsPage
        businessType="grocery"
        catalogSlug="finik"
        restaurant={groceryRestaurant}
        categories={groceryCategories}
        cabins={cabins}
        tags={[]}
        products={groceryProducts}
        theme={groceryTheme}
        photoQuality={DEFAULT_PHOTO_QUALITY_SETTINGS}
        paymentSettings={defaultPaymentSettings}
        deliverySettings={{ ...defaultRestaurantDeliverySettings, enable_hall_orders: true }}
        onSaveRestaurant={vi.fn()}
        onSaveCategories={vi.fn()}
        onSaveCabins={vi.fn()}
        onSaveTags={vi.fn()}
        onSaveTheme={vi.fn()}
        onSavePhotoQuality={vi.fn()}
        onSavePayments={vi.fn()}
        onSaveDelivery={onSaveDelivery}
        onImport={vi.fn()}
        onSignOut={vi.fn()}
      />
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('heading', { name: 'Настройки магазина' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Зал' })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Категории' }).click();
  await expect.element(screen.getByRole('button', { name: 'Столики и кабинки' })).not.toBeInTheDocument();
  await expect.element(screen.getByText(/блюд/i)).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Вернуться к настройкам' }).click();
  await screen.getByRole('button', { name: 'Доставка и заказы' }).click();
  await expect.element(screen.getByText('Настройки магазина')).toBeVisible();
  await expect.element(screen.getByText('Получение в магазине.')).toBeVisible();
  await expect.element(screen.getByText('Заказы в зале')).not.toBeInTheDocument();
  await expect.element(screen.getByText('Столики и кабинки.')).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Сохранить доставку' }).click();
  expect(onSaveDelivery).toHaveBeenCalledWith(expect.objectContaining({ enable_hall_orders: false }));
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
