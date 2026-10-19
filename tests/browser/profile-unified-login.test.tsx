import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ProfilePage } from '../../src/pages/client-platform/ClientPlatformApp';

const mocks = vi.hoisted(() => ({ login: vi.fn(), restore: vi.fn(async () => null) }));
vi.mock('../../src/shared/api/loginRedirectApi', () => ({ resolveUnifiedLogin: mocks.login }));
vi.mock('../../src/shared/api/clientAccountApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/shared/api/clientAccountApi')>(),
  restoreClientAccountSession: mocks.restore
}));

test.each([
  ['restaurant@example.ru', '/cafe/dashboard', 'Кабинет ресторана'],
  ['driver@example.ru', '/driver', 'Кабинет курьера'],
  ['+79280000000', '/profile', 'Профиль клиента']
])('profile login sends %s to the correct role', async (identifier, redirect, destination) => {
  mocks.login.mockResolvedValueOnce(redirect);
  const screen = await render(<MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<><ProfilePage /><span>Профиль клиента</span></>} />
    <Route path="/cafe/dashboard" element={<span>Кабинет ресторана</span>} />
    <Route path="/driver" element={<span>Кабинет курьера</span>} />
  </Routes></MemoryRouter>);
  await screen.getByRole('button', { name: /Личный кабинет|Войти или зарегистрироваться/ }).click();
  await screen.getByLabelText('Телефон или почта').fill(identifier);
  await screen.getByLabelText('Пароль').fill('testpassword');
  await screen.getByRole('button', { name: 'Войти', exact: true }).last().click();
  await expect.element(screen.getByText(destination)).toBeVisible();
  expect(mocks.login).toHaveBeenCalledWith(identifier, 'testpassword');
});
