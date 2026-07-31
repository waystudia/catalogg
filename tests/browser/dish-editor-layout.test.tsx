import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Category, Product } from '../../src/entities/models';
import { DishEditorPage } from '../../src/features/dish-editor/DishEditorPage';
import '../../src/app/styles.css';
import '../../src/features/dish-editor/styles.css';

const categories: Category[] = [
  { id: 'pizza', name: 'Пиццы', image: '', icon: '', kind: 'food' },
  { id: 'meat', name: 'Мясо', image: '', icon: '', kind: 'food' },
  { id: 'drinks', name: 'Напитки', image: '', icon: '', kind: 'drink' }
];

const product: Product = {
  id: 'dish-1',
  title: 'Четыре сезона',
  price: 550,
  description: 'Пицца с ветчиной, грибами, оливками и артишоками.',
  image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  image_urls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
  ingredients: 'Тесто, сыр, томаты, ветчина, грибы, оливки',
  weight: '520 г',
  spicy_level: 0,
  serving: 'с томатным соусом',
  is_popular: true,
  is_new: false,
  is_hit: false,
  stock_count: 9,
  category_id: 'pizza',
  category_ids: ['pizza'],
  pair_ids: [],
  choice_options: []
};

const renderDishEditor = (editingProduct: Product | null) => render(
  <div className="modal-backdrop">
    <section className="design-editor design-editor--dish">
      <DishEditorPage
        product={editingProduct}
        categories={categories}
        products={[product]}
        cartCount={0}
        onBack={vi.fn()}
        onSave={vi.fn()}
        onNavigate={vi.fn()}
      />
    </section>
  </div>
);

test('keeps the dish editor controls on one mobile screen and scrolls only the form content', async () => {
  await page.viewport(319, 613);

  try {
    const screen = await renderDishEditor(product);

    const editor = document.querySelector<HTMLElement>('.design-editor--dish');
    const form = document.querySelector<HTMLElement>('.dish-form');
    const header = screen.getByRole('heading', { name: 'Редактировать блюдо' }).element();
    const cancel = screen.getByRole('button', { name: 'Отмена' }).element();
    const save = screen.getByRole('button', { name: 'Сохранить изменения' }).element();

    expect(editor).not.toBeNull();
    expect(form).not.toBeNull();
    expect(editor!.getBoundingClientRect()).toMatchObject({ top: 0, left: 0, width: 319, height: 613 });
    expect(header.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(cancel.getBoundingClientRect().bottom).toBeLessThanOrEqual(613);
    expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(613);
    expect(getComputedStyle(form!).overflowY).toBe('auto');
    expect(form!.scrollHeight).toBeGreaterThan(form!.clientHeight);
  } finally {
    await page.viewport(414, 896);
  }
});

test('labels the primary action as adding a dish in create mode', async () => {
  const screen = await renderDishEditor(null);

  await expect.element(screen.getByRole('heading', { name: 'Добавить блюдо' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Добавить блюдо' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Сохранить изменения' })).not.toBeInTheDocument();
});
