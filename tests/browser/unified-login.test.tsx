import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../src/pages/login/LoginPage';
import { resolveUnifiedLogin } from '../../src/shared/api/loginRedirectApi';

vi.mock('../../src/shared/api/loginRedirectApi', { spy: true });

test('one login panel serves every WayYaam account by phone or email', async () => {
  const screen = await render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('heading', { name: 'Единый вход WayYaam' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Телефон' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Почта' })).toBeVisible();
  await expect.element(screen.getByText('Клиенты · рестораны · водители')).toBeVisible();

  await screen.getByRole('button', { name: 'Почта' }).click();
  await expect.element(screen.getByLabelText('Email')).toBeVisible();
  await screen.getByRole('button', { name: 'Телефон' }).click();
  await expect.element(screen.getByLabelText('Телефон')).toBeVisible();
});

test('successful superadmin login hands the session to the platform admin app', async () => {
  const navigateToRoleApp = vi.fn();
  vi.mocked(resolveUnifiedLogin).mockResolvedValue('/admin');
  const screen = await render(
    <MemoryRouter>
      <LoginPage
        navigateToRoleApp={navigateToRoleApp}
      />
    </MemoryRouter>
  );

  await screen.getByRole('button', { name: 'Почта' }).click();
  await screen.getByLabelText('Email').fill('admin@example.ru');
  await screen.getByLabelText('Пароль').fill('correct-password');
  await screen.getByRole('button', { name: 'Войти' }).click();

  expect(navigateToRoleApp).toHaveBeenCalledOnce();
  expect(navigateToRoleApp).toHaveBeenCalledWith('/admin/clients');
});
