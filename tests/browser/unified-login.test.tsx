import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../src/pages/login/LoginPage';

test('one login panel serves every WayYaam account by phone or email', async () => {
  const screen = await render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('heading', { name: 'Единый вход WayYaam' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Телефон' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Почта' })).toBeVisible();
  await expect.element(screen.getByText('Клиенты · рестораны · водители · суперадмин')).toBeVisible();

  await screen.getByRole('button', { name: 'Почта' }).click();
  await expect.element(screen.getByLabelText('Email')).toBeVisible();
  await screen.getByRole('button', { name: 'Телефон' }).click();
  await expect.element(screen.getByLabelText('Телефон')).toBeVisible();
});
