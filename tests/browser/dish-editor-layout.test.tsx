import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { Category, Product, Restaurant } from '../../src/entities/models';
import { DesignEditor } from '../../src/features/design-settings/DesignEditor';
import { useAdminStore } from '../../src/features/stores';
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

const restaurant: Restaurant = {
  id: 'restaurant-1',
  name: 'Мангал',
  subtitle: '',
  logo_url: '',
  banner_url: '',
  whatsapp: '',
  instagram_url: '',
  address: '',
  mapLink: '',
  lat: null,
  lng: null
};

const renderDishEditor = (editingProduct: Product | null, onSaveProduct = vi.fn()) => {
  useAdminStore.setState({ editor: 'dish', isPanelOpen: true });

  return render(
    <>
      <nav className="catalog-nav">
        <div className="catalog-nav__toolbar">Категории каталога</div>
      </nav>
      <DesignEditor
        editingProduct={editingProduct}
        categories={categories}
        products={[product]}
        restaurant={restaurant}
        onSaveProduct={onSaveProduct}
        onCloseProduct={vi.fn()}
        onUpdateRestaurant={vi.fn()}
        cartCount={0}
        onNavigate={vi.fn()}
      />
    </>
  );
};

test('keeps the dish editor controls on one mobile screen and scrolls only the form content', async () => {
  await page.viewport(319, 613);

  try {
    const screen = await renderDishEditor(product);

    const editor = document.querySelector<HTMLElement>('.design-editor--dish');
    const backdrop = document.querySelector<HTMLElement>('.modal-backdrop--dish-editor');
    const form = document.querySelector<HTMLElement>('.dish-form');
    const header = screen.getByRole('heading', { name: 'Редактировать блюдо' }).element();
    const cancel = screen.getByRole('button', { name: 'Отмена' }).element();
    const save = screen.getByRole('button', { name: 'Сохранить изменения' }).element();
    const photoSection = screen.getByRole('heading', { name: 'Фотографии блюда' }).element().closest<HTMLElement>('.dish-section');
    const description = screen.getByRole('textbox', { name: 'Описание' }).element();

    expect(editor).not.toBeNull();
    expect(backdrop).not.toBeNull();
    expect(form).not.toBeNull();
    expect(photoSection).not.toBeNull();
    expect(Number(getComputedStyle(backdrop!).zIndex)).toBeGreaterThan(40);
    expect(editor!.getBoundingClientRect()).toMatchObject({ top: 0, left: 0, width: 319, height: 613 });
    expect(editor!.contains(document.elementFromPoint(160, 20))).toBe(true);
    expect(header.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(cancel.getBoundingClientRect().bottom).toBeLessThanOrEqual(613);
    expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(613);
    expect(document.querySelector<HTMLElement>('.dish-actions')!.getBoundingClientRect().height).toBeLessThanOrEqual(60);
    expect(photoSection!.getBoundingClientRect().height).toBeLessThanOrEqual(145);
    expect(description.getBoundingClientRect().top).toBeLessThan(form!.getBoundingClientRect().bottom);
    expect(getComputedStyle(form!).overflowY).toBe('auto');
    expect(form!.scrollHeight).toBeGreaterThan(form!.clientHeight);
  } finally {
    useAdminStore.setState({ editor: null, isPanelOpen: false });
    await page.viewport(414, 896);
  }
});

test('labels the primary action as adding a dish in create mode', async () => {
  try {
    const screen = await renderDishEditor(null);

    await expect.element(screen.getByRole('heading', { name: 'Добавить блюдо' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Добавить блюдо' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Сохранить изменения' })).not.toBeInTheDocument();
  } finally {
    useAdminStore.setState({ editor: null, isPanelOpen: false });
  }
});

test('edits a separate name and price for every dish variant', async () => {
  const onSaveProduct = vi.fn();
  const pricedProduct: Product = {
    ...product,
    choice_options: [{ name: 'Средняя', price: 550 }]
  };

  try {
    const screen = await renderDishEditor(pricedProduct, onSaveProduct);
    const price = screen.getByRole('spinbutton', { name: 'Цена варианта 1' });
    price.element().scrollIntoView({ block: 'center' });

    await expect.element(screen.getByRole('textbox', { name: 'Название варианта 1' })).toHaveValue('Средняя');
    await expect.element(price).toHaveValue(550);
    await screen.getByRole('textbox', { name: 'Название варианта 1' }).fill('Большая');
    await price.fill('750');
    await screen.getByRole('button', { name: 'Сохранить изменения' }).click();

    await expect.poll(() => onSaveProduct.mock.calls.length).toBe(1);
    expect(onSaveProduct).toHaveBeenCalledWith(expect.objectContaining({
      choice_options: [{ name: 'Большая', price: 750 }]
    }));
  } finally {
    useAdminStore.setState({ editor: null, isPanelOpen: false });
  }
});
