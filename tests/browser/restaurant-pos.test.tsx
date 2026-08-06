import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Cabin, Category, Product } from '../../src/entities/models';
import { RestaurantPosPage } from '../../src/features/restaurant-pos/RestaurantPosPage';
import { makeCabinFeature } from '../../src/features/restaurant-settings/catalogAdminModel';

const categories: Category[] = [
  { id: 'hot', name: 'Горячее', image: '', icon: 'pot', kind: 'food' },
  { id: 'drinks', name: 'Напитки', image: '', icon: 'glass', kind: 'drink' }
];

const product = (overrides: Partial<Product>): Product => ({
  id: 'galnash',
  title: 'Жижиг-галнаш',
  price: 380,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '420 г',
  spicy_level: 0,
  serving: '',
  is_popular: true,
  is_new: false,
  is_hit: false,
  stock_count: 10,
  category_id: 'hot',
  pair_ids: [],
  ...overrides
});

const cabin = (overrides: Partial<Cabin> = {}): Cabin => ({
  id: 'cabin-2',
  title: 'Кабинка №2',
  capacity: 'до 6 гостей',
  feature: makeCabinFeature({ kind: 'cabin', status: 'active', type: 'vip', price: 750 }),
  image_url: '',
  ...overrides
});

test('cashier creates a draft from the existing restaurant catalog', async () => {
  await page.viewport(1360, 900);
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={categories}
      cabins={[]}
      products={[
        product({}),
        product({ id: 'tea', title: 'Чай облепиховый', price: 150, category_id: 'drinks' })
      ]}
      accessMode="active"
    />
  );

  await expect.element(screen.getByRole('heading', { name: 'Касса — Новый заказ' })).toBeVisible();
  await expect.element(screen.getByText('Блюда из текущего каталога «Мангал»')).toBeVisible();

  await screen.getByRole('button', { name: 'Показать все блюда' }).click();
  await screen.getByRole('button', { name: 'Добавить Жижиг-галнаш' }).click();
  await screen.getByRole('button', { name: 'Увеличить Жижиг-галнаш' }).click();
  await screen.getByRole('button', { name: 'Добавить Чай облепиховый' }).click();

  await expect.element(screen.getByLabelText('Сумма текущего заказа')).toHaveTextContent('910 ₽');
  await expect.element(screen.getByText('3 позиции')).toBeVisible();
  await screen.getByLabelText('Имя гостя').fill('Дуквах');
  await screen.getByRole('button', { name: 'В зале' }).click();
  await screen.getByRole('button', { name: 'Перевод' }).click();
  await expect.element(screen.getByRole('button', { name: 'Оформить заказ' })).toBeEnabled();
});

test('selected dish card shows its current cart quantity in the bottom-right corner', async () => {
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={categories}
      cabins={[]}
      products={[product({})]}
      accessMode="active"
    />
  );

  await screen.getByRole('button', { name: 'Открыть категорию Горячее' }).click();
  const dishCard = screen.getByRole('button', { name: 'Добавить Жижиг-галнаш' });

  await expect.element(screen.getByLabelText('Жижиг-галнаш в заказе: 1')).not.toBeInTheDocument();
  await dishCard.click();
  await expect.element(screen.getByLabelText('Жижиг-галнаш в заказе: 1')).toBeVisible();
  await dishCard.click();
  await expect.element(screen.getByLabelText('Жижиг-галнаш в заказе: 2')).toBeVisible();
  await screen.getByRole('button', { name: 'Уменьшить Жижиг-галнаш' }).click();
  await expect.element(screen.getByLabelText('Жижиг-галнаш в заказе: 1')).toBeVisible();
  await screen.getByRole('button', { name: 'Уменьшить Жижиг-галнаш' }).click();
  await expect.element(screen.getByLabelText('Жижиг-галнаш в заказе: 1')).not.toBeInTheDocument();
});

test('cashier calculates cash change and saves an unnamed customer as a numbered guest', async () => {
  const onSubmitOrder = vi.fn().mockResolvedValue(undefined);
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={categories}
      cabins={[]}
      products={[product({})]}
      accessMode="active"
      nextGuestNumber={7}
      onSubmitOrder={onSubmitOrder}
    />
  );

  await screen.getByRole('button', { name: 'Открыть категорию Горячее' }).click();
  await screen.getByRole('button', { name: 'Добавить Жижиг-галнаш' }).click();

  await expect.element(screen.getByRole('button', { name: 'Карта' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Смешанная' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Перевод' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Расчёт сдачи' })).toBeVisible();

  await screen.getByRole('button', { name: '5', exact: true }).click();
  await screen.getByRole('button', { name: '0', exact: true }).click();
  await screen.getByRole('button', { name: '0', exact: true }).click();
  await screen.getByRole('button', { name: 'Сдача', exact: true }).click();

  await expect.element(screen.getByText('Получено: 500 ₽', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Сдача: 120 ₽', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Оформить заказ' }).click();

  expect(onSubmitOrder).toHaveBeenCalledOnce();
  expect(onSubmitOrder.mock.calls[0][0]).toMatchObject({
    customerName: 'Гость №7',
    customerPhone: '',
    paymentMethod: 'cash',
    cashReceived: 500,
    cashChange: 120
  });
});

test('current order stays compact inside a landscape tablet viewport', async () => {
  await page.viewport(1011, 628);
  const screen = await render(
    <div style={{ height: '628px' }}>
      <RestaurantPosPage
        restaurantName="Мангал"
        categories={categories}
        cabins={[]}
        products={[
          product({}),
          product({ id: 'pizza', title: 'Пицца «Маргарита»', price: 400 }),
          product({ id: 'wings', title: 'Острые крылышки', price: 1200 }),
          product({ id: 'combo', title: 'Комбо', price: 700 }),
          product({ id: 'fries', title: 'Картошка фри', price: 150 }),
          product({ id: 'tea', title: 'Чай', price: 150 })
        ]}
        accessMode="active"
      />
    </div>
  );

  await screen.getByRole('button', { name: 'Показать все блюда' }).click();
  for (const title of ['Жижиг-галнаш', 'Пицца «Маргарита»', 'Острые крылышки', 'Комбо', 'Картошка фри', 'Чай']) {
    await screen.getByRole('button', { name: `Добавить ${title}` }).click();
  }

  const orderPanel = screen.getByRole('complementary', { name: 'Текущий заказ' }).element();
  const guestName = screen.getByLabelText('Имя гостя').element();
  const catalogPanel = screen.getByRole('region', { name: 'Каталог блюд' }).element();
  const firstOrderRow = screen
    .getByRole('complementary', { name: 'Текущий заказ' })
    .getByText('Жижиг-галнаш', { exact: true })
    .element()
    .closest<HTMLElement>('article');

  expect(orderPanel.getBoundingClientRect().width).toBeLessThanOrEqual(320);
  expect(orderPanel.getBoundingClientRect().height).toBeLessThanOrEqual(628);
  expect(firstOrderRow).not.toBeNull();
  expect(firstOrderRow!.getBoundingClientRect().height).toBeLessThanOrEqual(42);
  expect(guestName.getBoundingClientRect().height).toBeLessThanOrEqual(34);
  expect(catalogPanel.getBoundingClientRect().width).toBeGreaterThan(orderPanel.getBoundingClientRect().width * 1.5);
});

test('expired POS stays visible without allowing new operations', async () => {
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Rizih"
      categories={categories}
      cabins={[]}
      products={[product({})]}
      accessMode="read_only"
    />
  );

  await expect.element(screen.getByText('Подписка закончилась — доступен только просмотр')).toBeVisible();
  await screen.getByRole('button', { name: 'Открыть категорию Горячее' }).click();
  await expect.element(screen.getByRole('button', { name: 'Добавить Жижиг-галнаш' })).toBeDisabled();
  await expect.element(screen.getByRole('button', { name: 'Оформить заказ' })).toBeDisabled();
});

test('cashier opens one image category and sees four compact square dish cards per row', async () => {
  await page.viewport(1024, 900);
  const image = (label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text y="40">${label}</text></svg>`)}`;
  const richCategories: Category[] = [
    { id: 'hot', name: 'Горячее', image: image('hot'), icon: 'pot', kind: 'food' },
    { id: 'pizza', name: 'Пиццы', image: image('pizza'), icon: 'pizza', kind: 'food' },
    { id: 'fast', name: 'Фастфуд', image: image('fast'), icon: 'burger', kind: 'food' },
    { id: 'meat', name: 'Мясо', image: image('meat'), icon: 'meat', kind: 'food' },
    { id: 'drinks', name: 'Напитки', image: image('drinks'), icon: 'glass', kind: 'drink' }
  ];
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={richCategories}
      cabins={[]}
      products={[
        product({ id: 'dish-1', title: 'Блюдо 1' }),
        product({ id: 'dish-2', title: 'Блюдо 2' }),
        product({ id: 'dish-3', title: 'Блюдо 3' }),
        product({ id: 'dish-4', title: 'Блюдо 4' }),
        product({ id: 'tea', title: 'Чай', category_id: 'drinks' })
      ]}
      accessMode="active"
    />
  );

  const categoryButtons = richCategories.map((category) =>
    screen.getByRole('button', { name: `Открыть категорию ${category.name}` }).element()
  );
  const categoryBounds = categoryButtons.map((button) => button.getBoundingClientRect());

  expect(categoryBounds.slice(0, 4).every((bounds) => bounds.top === categoryBounds[0].top)).toBe(true);
  expect(categoryBounds[4].top).toBeGreaterThan(categoryBounds[0].top);
  await expect.element(screen.getByRole('img', { name: 'Напитки' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Добавить Блюдо 1' })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Открыть категорию Горячее' }).click();
  await expect.element(screen.getByRole('navigation', { name: 'Категории POS' })).not.toBeInTheDocument();
  const productCards = ['Блюдо 1', 'Блюдо 2', 'Блюдо 3', 'Блюдо 4'].map((title) =>
    screen.getByRole('button', { name: `Добавить ${title}` }).element()
  );
  const productBounds = productCards.map((button) => button.getBoundingClientRect());
  expect(productBounds.every((bounds) => bounds.top === productBounds[0].top)).toBe(true);
  expect(productBounds.every((bounds) => Math.abs(bounds.width - bounds.height) <= 1)).toBe(true);
  await expect.element(screen.getByText('Блюдо 1', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('420 г', { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByText('380 ₽', { exact: true })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Вернуться к категориям' }).click();
  await expect.element(screen.getByRole('button', { name: 'Открыть категорию Напитки' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Добавить Блюдо 1' })).not.toBeInTheDocument();
});

test('holding a square dish card reveals its description, weight and price without adding it', async () => {
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={categories}
      cabins={[]}
      products={[product({ description: 'Галнаш с говядиной и чесночным соусом' })]}
      accessMode="active"
    />
  );

  await screen.getByRole('button', { name: 'Открыть категорию Горячее' }).click();
  const card = screen.getByRole('button', { name: 'Добавить Жижиг-галнаш' }).element();
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 650));
  card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

  await expect.element(screen.getByRole('dialog', { name: 'Жижиг-галнаш' })).toBeVisible();
  await expect.element(screen.getByText('Галнаш с говядиной и чесночным соусом')).toBeVisible();
  await expect.element(screen.getByText('420 г')).toBeVisible();
  await expect.element(screen.getByText('380 ₽')).toBeVisible();
  await expect.element(screen.getByText('0 позиции')).toBeVisible();
});

test('cashier chooses a numbered table or an active cabin from existing restaurant settings', async () => {
  const screen = await render(
    <RestaurantPosPage
      restaurantName="Мангал"
      categories={categories}
      cabins={[
        cabin({
          id: 'table-15',
          title: 'Стол 15',
          capacity: '4 гостя',
          feature: makeCabinFeature({ kind: 'table', status: 'active', type: 'normal', price: 0 })
        }),
        cabin(),
        cabin({
          id: 'closed-cabin',
          title: 'Кабинка закрыта',
          feature: makeCabinFeature({ kind: 'cabin', status: 'inactive', type: 'normal', price: 300 })
        })
      ]}
      products={[product({})]}
      accessMode="active"
    />
  );

  await screen.getByRole('button', { name: 'Стол 15' }).click();
  await expect.element(screen.getByLabelText('Номер столика')).toHaveValue('15');
  await expect.element(screen.getByRole('button', { name: 'Стол 4' })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Кабинка' }).click();
  await expect.element(screen.getByRole('button', { name: 'Выбрать Кабинка №2' })).toBeVisible();
  await expect.element(screen.getByText('Кабинка закрыта')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Выбрать Кабинка №2' }).click();
  await expect.element(screen.getByText('Кабинка №2 · 750 ₽')).toBeVisible();

  await screen.getByRole('button', { name: 'Столик' }).click();
  await expect.element(screen.getByLabelText('Номер столика')).toHaveValue('');
  await screen.getByRole('button', { name: 'Кабинка' }).click();
  await expect.element(screen.getByText('Кабинка №2 · 750 ₽')).not.toBeInTheDocument();
});
