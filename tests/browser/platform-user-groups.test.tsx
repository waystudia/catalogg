import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PlatformUsersPage } from '../../src/features/platform-admin-users/PlatformUsersPage';

const renderUsersPage = (deleteUser?: (target: { kind: 'restaurant' | 'driver' | 'client'; id: string }) => Promise<void>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlatformUsersPage deleteUser={deleteUser} />
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
