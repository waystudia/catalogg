import { beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantActivationsAdminPage } from '../../src/features/platform-admin-activations/RestaurantActivationsAdminPage';
import type {
  RestaurantActivationAdminRow,
  RestaurantActivationAdminSetup,
  RestaurantActivationAdminService
} from '../../src/features/platform-admin-activations/restaurantActivationAdminApi';

const adminRow = (overrides: Partial<RestaurantActivationAdminRow> = {}): RestaurantActivationAdminRow => ({
  clientId: 'client-1',
  catalogId: 'catalog-1',
  restaurantName: 'Мангал',
  ownerName: 'Магомед Алиев',
  phone: '+7 928 000-00-00',
  legalStatus: 'legacy_review_required',
  bundleVersion: null,
  acceptedAt: null,
  confirmationMethod: null,
  pendingRequestId: null,
  missingSetup: ['legal_profile', 'published_document_bundle'],
  ...overrides
});

const adminSetup = (overrides: Partial<RestaurantActivationAdminSetup> = {}): RestaurantActivationAdminSetup => ({
  clientId: 'client-1',
  catalogId: 'catalog-1',
  catalogSlug: 'mangal',
  restaurantName: 'Мангал',
  legalStatus: 'legacy_review_required',
  logoUrl: '/assets/mangal-logo.png',
  profile: {
    organizationType: 'ИП',
    legalName: 'ИП Алиев Магомед Русланович',
    inn: '201234567890',
    ogrn: '326200000000001',
    legalAddress: 'г. Грозный, ул. Мира, 1',
    actualAddress: 'г. Грозный, пр. Путина, 10',
    restaurantPhone: '+7 928 000-00-00',
    restaurantEmail: 'mangal@example.com',
    directorFullName: 'Алиев Магомед Русланович',
    representativeFullName: 'Алиев Магомед Русланович',
    authorityBasis: 'Свидетельство о регистрации ИП',
    primaryConfirmationPhone: '+7 928 000-00-00',
    primaryConfirmationEmail: 'mangal@example.com',
    deliveryModel: 'WayYaam и курьеры ресторана'
  },
  tariff: {
    name: 'Базовый',
    restaurantCommissionAmount: 30,
    driverCommissionAmount: 30,
    version: '2.0-mangal',
    startsAt: '2026-08-07T00:00:00.000Z',
    freePeriodTerms: '',
    commissionRules: '30 ₽ за принятый заказ и 30 ₽ за доставку',
    individualTerms: ''
  },
  bundle: { id: 'bundle-1', title: 'Оферта WayYaam', version: '2.0', effectiveFrom: '2026-08-06T00:00:00.000Z' },
  missingSetup: ['legal_profile'],
  ...overrides
});

const adminService = (rows = [adminRow()]): RestaurantActivationAdminService => ({
  list: vi.fn(async () => rows),
  loadSetup: vi.fn(async () => adminSetup()),
  saveSetup: vi.fn(async (_clientId, input) => adminSetup({
    logoUrl: input.logoUrl,
    profile: input.profile,
    tariff: input.tariff
  })),
  finishSetup: vi.fn(async () => ({ ready: false, missing: ['published_document_bundle'] })),
  issueManualCode: vi.fn(async () => ({
    requestId: 'request-1',
    code: '654321',
    expiresAt: '2026-08-05T20:10:00.000Z',
    destinationMasked: '+7 *** ***-00-00'
  }))
});

beforeEach(() => {
  window.location.hash = '';
});

test('super administrator opens the selected restaurant setup instead of trying to finish it immediately', async () => {
  const service = adminService();
  const screen = await render(<RestaurantActivationsAdminPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Договоры и активации' })).toBeVisible();
  await expect.element(screen.getByText('Мангал')).toBeVisible();
  await expect.element(screen.getByRole('article').getByText('Требуется проверка')).toBeVisible();

  await screen.getByRole('button', { name: 'Завершить настройку Мангал' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Настройка активации: Мангал' })).toBeVisible();
  await expect.element(screen.getByLabelText('Юридическое наименование')).toHaveValue('ИП Алиев Магомед Русланович');
  await expect.element(screen.getByText('Оферта WayYaam · версия 2.0')).toBeVisible();
  expect(service.loadSetup).toHaveBeenCalledWith('client-1');
  expect(service.finishSetup).not.toHaveBeenCalled();
});

test('restaurant-specific legal details and tariff are saved before owner acceptance', async () => {
  const service = adminService();
  const screen = await render(<RestaurantActivationsAdminPage service={service} />);

  await screen.getByRole('button', { name: 'Завершить настройку Мангал' }).click();
  await screen.getByLabelText('Юридическое наименование').fill('ООО «Мангал Грозный»');
  await screen.getByLabelText('ИНН').fill('2011000000');
  await screen.getByLabelText('Версия тарифа').fill('2.1-mangal');
  await screen.getByRole('button', { name: 'Сохранить данные' }).click();

  await expect.element(screen.getByText('Данные ресторана сохранены. Владелец увидит их перед принятием оферты.')).toBeVisible();
  expect(service.saveSetup).toHaveBeenCalledWith('client-1', expect.objectContaining({
    profile: expect.objectContaining({ legalName: 'ООО «Мангал Грозный»', inn: '2011000000' }),
    tariff: expect.objectContaining({ version: '2.1-mangal' })
  }));
});

test('manual code is revealed to the super administrator only for an owner request', async () => {
  const service = adminService([adminRow({
    legalStatus: 'awaiting_acceptance',
    pendingRequestId: 'request-1',
    missingSetup: []
  })]);
  const screen = await render(<RestaurantActivationsAdminPage service={service} />);

  await screen.getByRole('button', { name: 'Создать ручной код для Мангал' }).click();
  await expect.element(screen.getByText('654321')).toBeVisible();
  await expect.element(screen.getByText(/код показывается только сейчас/i)).toBeVisible();
  expect(service.issueManualCode).toHaveBeenCalledWith('request-1');
});
