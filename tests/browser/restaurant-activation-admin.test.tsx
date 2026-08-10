import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantActivationsAdminPage } from '../../src/features/platform-admin-activations/RestaurantActivationsAdminPage';
import type {
  RestaurantActivationAdminRow,
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

const adminService = (rows = [adminRow()]): RestaurantActivationAdminService => ({
  list: vi.fn(async () => rows),
  finishSetup: vi.fn(async () => ({ ready: false, missing: ['published_document_bundle'] })),
  issueManualCode: vi.fn(async () => ({
    requestId: 'request-1',
    code: '654321',
    expiresAt: '2026-08-05T20:10:00.000Z',
    destinationMasked: '+7 *** ***-00-00'
  }))
});

test('super administrator sees existing restaurants as requiring activation and exact setup gaps', async () => {
  const service = adminService();
  const screen = await render(<RestaurantActivationsAdminPage service={service} />);

  await expect.element(screen.getByRole('heading', { name: 'Договоры и активации' })).toBeVisible();
  const checklistLink = screen.getByRole('link', { name: 'Скачать памятку PDF' });
  await expect.element(checklistLink).toBeVisible();
  await expect.element(checklistLink).toHaveAttribute(
    'href',
    '/downloads/wayyaam-restaurant-onboarding-checklist.pdf'
  );
  await expect.element(checklistLink).toHaveAttribute('download', 'WayYaam-памятка-для-ресторана.pdf');
  await expect.element(screen.getByText('Мангал')).toBeVisible();
  await expect.element(screen.getByRole('article').getByText('Требуется проверка')).toBeVisible();

  await screen.getByRole('button', { name: 'Завершить настройку Мангал' }).click();
  await expect.element(screen.getByText('Настройка не завершена: не опубликован пакет договора.')).toBeVisible();
  expect(service.finishSetup).toHaveBeenCalledWith('client-1');
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
