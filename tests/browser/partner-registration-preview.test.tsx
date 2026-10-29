import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { PartnerRegistrationPreview } from '../../src/features/partner-registration-preview/PartnerRegistrationPreview';

async function fillAccount(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByLabelText('Имя и фамилия').fill('Тестовый пользователь');
  await screen.getByLabelText('Телефон', { exact: true }).fill('+79000000000');
  await screen.getByLabelText('Почта').fill('test@example.com');
  await screen.getByLabelText(/Пароль/).fill('testpassword');
  await screen.getByText('Принимаю условия и согласие на обработку данных').click();
  await screen.getByRole('button', { name: /продолжить/i }).click();
}

test('seller can move from the existing profile entry to a safe demo cabinet', async () => {
  const screen = await render(<MemoryRouter><PartnerRegistrationPreview /></MemoryRouter>);

  await screen.getByRole('button', { name: 'Регистрация' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Как будете работать?' })).toBeVisible();
  await screen.getByRole('button', { name: /продавец ресторан/i }).click();
  await expect.element(screen.getByRole('heading', { name: 'Расскажите о себе' })).toBeVisible();
  await fillAccount(screen);
  await expect.element(screen.getByRole('heading', { name: 'Добавьте бизнес' })).toBeVisible();
  await screen.getByRole('button', { name: /магазин/i }).click();
  await screen.getByRole('button', { name: /создать демо-кабинет/i }).click();
  await expect.element(screen.getByRole('heading', { name: 'Кабинет готов' })).toBeVisible();
  await expect.element(screen.getByText(/ожидается подтверждение со стороны wayyaam/i)).toBeVisible();
  await expect.element(screen.getByText(/покупатели не видят каталог/i)).toBeVisible();
});

test('courier selects work areas and completes the redesigned vehicle card', async () => {
  const screen = await render(<MemoryRouter><PartnerRegistrationPreview /></MemoryRouter>);

  await screen.getByRole('button', { name: 'Регистрация' }).click();
  await screen.getByRole('button', { name: /курьер доставка/i }).click();
  await fillAccount(screen);
  await expect.element(screen.getByRole('heading', { name: 'Где будете работать' })).toBeVisible();
  await screen.getByRole('button', { name: /шали/i }).click();
  await expect.element(screen.getByText('3 зоны выбрано')).toBeVisible();
  await screen.getByRole('button', { name: /выбрать транспорт/i }).click();
  await expect.element(screen.getByRole('heading', { name: 'Ваш транспорт' })).toBeVisible();
  await screen.getByRole('button', { name: 'Фургон' }).click();
  await screen.getByRole('button', { name: 'Синий' }).click();
  await expect.element(screen.getByLabelText('Госномер')).toHaveValue('А123ВС');
  await expect.element(screen.getByRole('button', { name: /сканировать стс/i })).toBeVisible();
  await screen.getByRole('button', { name: /отправить заявку/i }).click();
  await expect.element(screen.getByRole('heading', { name: 'Проверяем данные' })).toBeVisible();
  await expect.element(screen.getByText(/ожидается подтверждение со стороны wayyaam/i)).toBeVisible();
  await expect.element(screen.getByText(/доступ к заказам закрыт/i)).toBeVisible();
});

test('preview exposes the existing superadmin queues without creating a separate dashboard', async () => {
  await page.viewport(1280, 900);
  try {
    const screen = await render(<MemoryRouter><PartnerRegistrationPreview /></MemoryRouter>);

    await screen.getByRole('button', { name: /заявка продавца/i }).click();
    await expect.element(screen.getByRole('heading', { name: 'Заявка продавца' })).toBeVisible();
    await expect.element(screen.getByText('WayYaam Admin')).toBeVisible();
    await screen.getByRole('button', { name: /одобрить продавца/i }).click();
    await expect.element(screen.getByRole('heading', { name: 'Продавец одобрен' })).toBeVisible();
  } finally {
    await page.viewport(414, 896);
  }
});

test('mobile preview fills the viewport and keeps the primary flow reachable', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(<MemoryRouter><PartnerRegistrationPreview /></MemoryRouter>);
    await expect.element(screen.getByRole('button', { name: 'Регистрация' })).toBeVisible();
    await screen.getByRole('button', { name: 'Регистрация' }).click();
    await expect.element(screen.getByRole('button', { name: /продавец ресторан/i })).toBeVisible();
  } finally {
    await page.viewport(414, 896);
  }
});

test('direct courier registration submits a real application instead of showing demo copy', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/registration-preview?start=courier']}>
      <PartnerRegistrationPreview />
    </MemoryRouter>
  );

  expect(screen.getByText(/демонстрация: заявка не отправляется/i).elements()).toHaveLength(0);
  await screen.getByLabelText('Имя и фамилия').fill('Тестовый Курьер');
  await screen.getByLabelText('Телефон').fill('+79000000000');
  await screen.getByLabelText('Почта').fill('courier@example.com');
  await screen.getByText(/принимаю условия/i).click();
  await screen.getByRole('button', { name: /продолжить/i }).click();
  await screen.getByRole('button', { name: /выбрать транспорт/i }).click();
  await screen.getByRole('button', { name: /отправить заявку/i }).click();
  await expect.element(screen.getByRole('heading', { name: 'Заявка отправлена' })).toBeVisible();
  await expect.element(screen.getByText(/заявка №/i)).toBeVisible();
});
