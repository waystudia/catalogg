import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PlatformUsersPage } from '../../src/features/platform-admin-users/PlatformUsersPage';
import type { PlatformLegalConsentRecord, PlatformLegalConsentSubject } from '../../src/shared/api/platformUsersApi';

const renderUsersPage = (
  deleteUser?: (target: { kind: 'restaurant' | 'driver' | 'client'; id: string }) => Promise<void>,
  getLegalHistory?: (subject: PlatformLegalConsentSubject) => Promise<PlatformLegalConsentRecord[]>
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlatformUsersPage deleteUser={deleteUser} getLegalHistory={getLegalHistory} />
    </QueryClientProvider>
  );
};

test('superadmin separates restaurants, drivers and clients into user groups', async () => {
  const screen = await renderUsersPage();

  const groups = screen.getByRole('tablist', { name: 'Группы пользователей' });
  await expect.element(groups.getByRole('tab', { name: /Рестораны/u })).toBeVisible();
  await expect.element(groups.getByRole('tab', { name: /Водители/u })).toBeVisible();
  await expect.element(groups.getByRole('tab', { name: /Клиенты/u })).toBeVisible();

  await groups.getByRole('tab', { name: /Водители/u }).click();
  await expect.element(screen.getByText('Алан М.', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Мангал', { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
});

test('superadmin sees the version, timestamp and source of every client consent', async () => {
  const getLegalHistory = vi.fn(async () => [{
    id: 'consent-1',
    documentCode: 'client_consent',
    documentVersion: '3.0',
    documentSha256: 'a'.repeat(64),
    granted: true,
    source: 'client_registration',
    grantedAt: '2026-08-21T06:30:00.000Z',
    revokedAt: null,
    createdAt: '2026-08-21T06:30:00.000Z',
    orderId: null
  }]);
  const screen = await renderUsersPage(undefined, getLegalHistory);

  await screen.getByRole('tab', { name: /Клиенты/u }).click();
  await screen.getByRole('button', { name: /Адам М\./u }).click();
  const details = screen.getByRole('dialog', { name: 'Адам М.' });
  await expect.element(details.getByText('История согласий')).toBeVisible();
  await expect.element(details.getByText('Согласие на обработку персональных данных')).toBeVisible();
  await expect.element(details.getByText(/Версия 3\.0 · Регистрация/u)).toBeVisible();
  await expect.element(details.getByText(/Принято/u)).toBeVisible();
  expect(getLegalHistory).toHaveBeenCalledWith({ kind: 'client', phone: '+7 928 123-45-67' });
});

test('superadmin can open consent history for businesses and drivers too', async () => {
  const getLegalHistory = vi.fn(async () => []);
  const screen = await renderUsersPage(undefined, getLegalHistory);

  await screen.getByRole('button', { name: 'История согласий Мангал' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Мангал' }).getByText('История согласий')).toBeVisible();
  expect(getLegalHistory).toHaveBeenCalledWith({ kind: 'restaurant', id: 'catalog-mangal' });

  await screen.getByRole('dialog', { name: 'Мангал' }).getByRole('button', { name: 'Закрыть', exact: true }).click();
  await screen.getByRole('tab', { name: /Водители/u }).click();
  await screen.getByRole('button', { name: 'История согласий Алан М.' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Алан М.' }).getByText('История согласий')).toBeVisible();
  expect(getLegalHistory).toHaveBeenCalledWith({ kind: 'driver', id: 'driver-demo' });
});

test('superadmin deletes only the selected account after an explicit confirmation', async () => {
  const deleteUser = vi.fn(async () => undefined);
  const screen = await renderUsersPage(deleteUser);

  await screen.getByRole('tab', { name: /Водители/u }).click();
  await screen.getByRole('button', { name: 'Удалить пользователя Алан М.' }).click();

  const confirmation = screen.getByRole('alertdialog', { name: 'Удалить водителя?' });
  await expect.element(confirmation.getByText('Алан М.', { exact: true })).toBeVisible();
  await expect.element(confirmation.getByText(/заказы и история сохранятся/iu)).toBeVisible();

  await confirmation.getByRole('button', { name: 'Отмена' }).click();
  expect(deleteUser).not.toHaveBeenCalled();

  await screen.getByRole('button', { name: 'Удалить пользователя Алан М.' }).click();
  await screen.getByRole('alertdialog', { name: 'Удалить водителя?' })
    .getByRole('button', { name: 'Удалить пользователя' })
    .click();

  expect(deleteUser).toHaveBeenCalledExactlyOnceWith({ kind: 'driver', id: 'driver-demo' });
});

test('superadmin can confirm deletion of a client from the client card', async () => {
  const deleteUser = vi.fn(async () => undefined);
  const screen = await renderUsersPage(deleteUser);

  await screen.getByRole('tab', { name: /Клиенты/u }).click();
  await screen.getByRole('button', { name: /Адам М\./u }).click();
  await screen.getByRole('dialog', { name: 'Адам М.' })
    .getByRole('button', { name: 'Удалить пользователя Адам М.' })
    .click();
  await screen.getByRole('alertdialog', { name: 'Удалить клиента?' })
    .getByRole('button', { name: 'Удалить пользователя' })
    .click();

  expect(deleteUser).toHaveBeenCalledExactlyOnceWith({ kind: 'client', id: 'signup-adam' });
});
