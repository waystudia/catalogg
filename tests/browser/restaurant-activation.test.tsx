import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantActivationPage } from '../../src/features/restaurant-activation/RestaurantActivationPage';
import type {
  RestaurantActivationService,
  RestaurantActivationView
} from '../../src/features/restaurant-activation/restaurantActivationApi';

const activationView = (overrides: Partial<RestaurantActivationView> = {}): RestaurantActivationView => ({
  clientId: 'client-1',
  catalogId: 'catalog-1',
  catalogSlug: 'mangal',
  businessType: 'restaurant',
  legalStatus: 'awaiting_acceptance',
  canAcceptLegalDocuments: true,
  memberRole: 'owner',
  restaurant: {
    name: 'Мангал',
    organizationType: 'ИП',
    legalName: 'ИП Алиев Магомед Ахмедович',
    inn: '201234567890',
    ogrn: '326200000000001',
    legalAddress: 'г. Грозный, ул. Мира, 1',
    actualAddress: 'г. Грозный, ул. Примерная, 10',
    directorFullName: 'Алиев Магомед Ахмедович',
    representativeFullName: 'Алиев Магомед Ахмедович',
    authorityBasis: 'Индивидуальный предприниматель',
    phone: '+7 928 000-00-00',
    email: 'owner@example.ru',
    deliveryModel: 'Водители WayYaam'
  },
  tariff: {
    name: 'Стартовый',
    restaurantCommissionAmount: 30,
    driverCommissionAmount: 30,
    version: '1.0',
    effectiveFrom: '2026-08-05',
    commissionRules: '30 ₽ за принятый заказ',
    freePeriodTerms: null,
    individualTerms: 'Первые 14 дней без абонентской платы'
  },
  bundleId: 'bundle-1',
  bundleVersion: '1.0',
  documents: [
    {
      id: 'document-contract',
      type: 'restaurant_contract',
      title: 'Договор подключения ресторана',
      version: '1.0',
      effectiveFrom: '2026-08-05',
      pdfUrl: '/legal/restaurant-contract-v1.pdf',
      fileHash: 'a'.repeat(64),
      opened: false
    },
    {
      id: 'document-tariff',
      type: 'tariff',
      title: 'Тарифы',
      version: '1.0',
      effectiveFrom: '2026-08-05',
      pdfUrl: '/legal/tariff-v1.pdf',
      fileHash: 'b'.repeat(64),
      opened: false
    }
  ],
  pendingRequestId: null,
  ...overrides
});

const activationService = (view = activationView()): RestaurantActivationService => ({
  loadCurrent: vi.fn(async () => view),
  markDocumentOpened: vi.fn(async () => undefined),
  requestCode: vi.fn(async () => ({ requestId: 'request-1', status: 'awaiting_manual_code' })),
  confirmActivation: vi.fn(async () => ({ ok: true, acceptanceId: 'acceptance-1', legalStatus: 'active' as const })),
  signOut: vi.fn(async () => undefined)
});

test('owner reviews separate documents and confirmations before activating with a code', async () => {
  const service = activationService();
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Активация ресторана в WayYaam' })).toBeVisible();
  await expect.element(screen.getByText('1 из 5')).toBeVisible();
  await expect.element(screen.getByText('ИП Алиев Магомед Ахмедович')).toBeVisible();
  await expect.element(screen.getByText('326200000000001')).toBeVisible();
  await expect.element(screen.getByText('Первые 14 дней без абонентской платы')).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Вернуться в кабинет' })).toHaveAttribute('href', '#/business/mangal');
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeDisabled();

  const checkboxes = screen.getByRole('checkbox');
  await expect.element(checkboxes.nth(0)).not.toBeChecked();
  await expect.element(checkboxes.nth(6)).not.toBeChecked();

  await screen.getByRole('button', { name: 'Открыть Договор подключения ресторана' }).click();
  await expect.element(screen.getByText('Открыт', { exact: true })).toBeVisible();
  expect(service.markDocumentOpened).toHaveBeenCalledWith('document-contract');

  for (let index = 0; index < 7; index += 1) {
    await checkboxes.nth(index).click();
  }

  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeEnabled();
  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();
  await expect.element(screen.getByText('4 из 5')).toBeVisible();
  await expect.element(screen.getByText(/ручной одноразовый код у супер-администратора/i)).toBeVisible();

  await screen.getByLabelText('Шестизначный код').fill('123456');
  await screen.getByRole('button', { name: 'Активировать ресторан' }).click();

  await expect.element(screen.getByText('5 из 5')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Ресторан активирован' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /перейти в кабинет/i })).toHaveAttribute('href', '#/business/mangal');
  expect(service.confirmActivation).toHaveBeenCalledWith('request-1', '123456');
});

test('employee without authority cannot request or submit a legal code', async () => {
  const service = activationService(activationView({
    canAcceptLegalDocuments: false,
    memberRole: 'viewer'
  }));
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByText(/у вашей роли нет права принимать юридические документы/i)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).not.toBeInTheDocument();
});

test('grocery activation keeps store terminology and returns to the grocery cabinet', async () => {
  const service = activationService(activationView({
    catalogSlug: 'finik',
    businessType: 'grocery',
    restaurant: {
      ...activationView().restaurant,
      name: 'Финик'
    },
    pendingRequestId: 'request-1'
  }));
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Активация магазина в WayYaam' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Вернуться в кабинет' })).toHaveAttribute('href', '#/business/finik');
  await expect.element(screen.getByText(/сведений о магазине/i)).toBeVisible();
  await expect.element(screen.getByText(/от имени магазина/i)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Активировать магазин' })).toBeVisible();
  await expect.element(screen.getByText(/вашего ресторана/i)).not.toBeInTheDocument();
});

test('restaurant remains blocked while the contract bundle has not been published', async () => {
  const service = activationService(activationView({
    bundleId: null,
    bundleVersion: null,
    documents: []
  }));
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByText(/пакет договора ещё не опубликован/i)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeDisabled();
});

test('owner can review data but cannot request a code before the administrator sends the setup', async () => {
  const service = activationService(activationView({ legalStatus: 'legacy_review_required' }));
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByText(/супер-администратор ещё настраивает реквизиты/i)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeDisabled();
});

test('an account without ownership sees a clear activation access message', async () => {
  const service = activationService();
  vi.mocked(service.loadCurrent).mockRejectedValueOnce(new Error('access_denied'));
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Активация недоступна' })).toBeVisible();
  await expect.element(screen.getByText(/войдите под аккаунтом владельца этого ресторана/i)).toBeVisible();
  await expect.element(screen.getByText('access_denied', { exact: true })).not.toBeInTheDocument();
});

test('a retry after a lost response reuses the same activation idempotency key', async () => {
  const service = activationService();
  vi.mocked(service.requestCode)
    .mockRejectedValueOnce(new Error('Сеть временно недоступна.'))
    .mockResolvedValueOnce({ requestId: 'request-1', status: 'awaiting_manual_code' });
  const screen = await render(<RestaurantActivationPage service={service} />);
  const checkboxes = screen.getByRole('checkbox');

  for (let index = 0; index < 7; index += 1) {
    await checkboxes.nth(index).click();
  }

  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();
  await expect.element(screen.getByText('Сеть временно недоступна.')).toBeVisible();
  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();

  const firstInput = vi.mocked(service.requestCode).mock.calls[0]?.[0];
  const secondInput = vi.mocked(service.requestCode).mock.calls[1]?.[0];
  expect(firstInput?.idempotencyKey).toBeTruthy();
  expect(secondInput?.idempotencyKey).toBe(firstInput?.idempotencyKey);
});

test('activation explains that every pre-activation test order must be deleted first', async () => {
  const service = activationService(activationView({ pendingRequestId: 'request-1' }));
  vi.mocked(service.confirmActivation).mockResolvedValueOnce({
    ok: false,
    error: 'restaurant_test_orders_must_be_deleted'
  });
  const screen = await render(<RestaurantActivationPage service={service} />);

  await screen.getByLabelText('Шестизначный код').fill('123456');
  await screen.getByRole('button', { name: 'Активировать ресторан' }).click();

  await expect.element(
    screen.getByRole('alert').getByText(/перед активацией удалите все тестовые заказы/i)
  ).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Ресторан активирован' })).not.toBeInTheDocument();
});
