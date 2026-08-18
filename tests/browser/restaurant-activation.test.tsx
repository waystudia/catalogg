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
  legalStatus: 'awaiting_acceptance',
  canAcceptLegalDocuments: true,
  memberRole: 'owner',
  restaurant: {
    name: 'Мангал',
    legalName: 'ИП Алиев Магомед Ахмедович',
    inn: '201234567890',
    actualAddress: 'г. Грозный, ул. Примерная, 10',
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
    effectiveFrom: '2026-08-05'
  },
  bundleId: 'bundle-1',
  bundleVersion: '1.0',
  documents: [
    {
      id: 'document-contract',
      type: 'restaurant_contract',
      title: 'Универсальный договор-оферта для бизнес-партнёров',
      version: '3.0',
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

test('owner reviews every document and confirmation before activating with a code', async () => {
  const service = activationService();
  const screen = await render(<RestaurantActivationPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Активация бизнес-партнёра в WayYaam' })).toBeVisible();
  await expect.element(screen.getByText('1 из 5')).toBeVisible();
  await expect.element(screen.getByText('ИП Алиев Магомед Ахмедович')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeDisabled();

  const checkboxes = screen.getByRole('checkbox');
  await expect.element(checkboxes.nth(0)).not.toBeChecked();
  await expect.element(checkboxes.nth(6)).not.toBeChecked();

  await screen.getByRole('button', { name: 'Открыть Универсальный договор-оферта для бизнес-партнёров' }).click();
  await expect.element(screen.getByText('Открыт', { exact: true })).toBeVisible();
  expect(service.markDocumentOpened).toHaveBeenCalledWith('document-contract');

  for (let index = 0; index < 7; index += 1) {
    await checkboxes.nth(index).click();
  }

  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeDisabled();
  await screen.getByRole('button', { name: 'Открыть Тарифы' }).click();
  await expect.element(screen.getByRole('button', { name: 'Запросить код подтверждения' })).toBeEnabled();
  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();
  await expect.element(screen.getByText('4 из 5')).toBeVisible();
  await expect.element(screen.getByText(/ручной одноразовый код у супер-администратора/i)).toBeVisible();

  await screen.getByLabelText('Шестизначный код').fill('123456');
  await screen.getByRole('button', { name: 'Активировать бизнес' }).click();

  await expect.element(screen.getByText('5 из 5')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Бизнес-партнёр активирован' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /перейти в кабинет/i })).toHaveAttribute('href', '#/mangal/dashboard');
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

  await screen.getByRole('button', { name: 'Открыть Универсальный договор-оферта для бизнес-партнёров' }).click();
  await screen.getByRole('button', { name: 'Открыть Тарифы' }).click();

  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();
  await expect.element(screen.getByText('Сеть временно недоступна.')).toBeVisible();
  await screen.getByRole('button', { name: 'Запросить код подтверждения' }).click();

  const firstInput = vi.mocked(service.requestCode).mock.calls[0]?.[0];
  const secondInput = vi.mocked(service.requestCode).mock.calls[1]?.[0];
  expect(firstInput?.idempotencyKey).toBeTruthy();
  expect(secondInput?.idempotencyKey).toBe(firstInput?.idempotencyKey);
});
