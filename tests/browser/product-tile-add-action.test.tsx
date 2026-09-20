import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Product } from '../../src/entities/models';
import { ProductTile } from '../../src/features/catalog/ProductTile';
import { useAuthStore, useCartStore } from '../../src/features/stores';
import '../../src/app/styles.css';

const product: Product = {
  id: 'pide', title: 'Пиде с мясом', price: 350, description: '', image_url: '', image_urls: [],
  ingredients: '', weight: '400 г', spicy_level: 0, serving: '', is_popular: false, is_new: false,
  is_hit: false, stock_count: 10, is_unlimited: true, category_id: 'pizza', category_ids: ['pizza'],
  pair_ids: [], choice_options: [], modifier_groups: [], pricing_type: 'fixed'
};

test('plus adds a regular dish without opening its detail card', async () => {
  useAuthStore.setState({ isAdmin: false });
  useCartStore.setState({ items: [], updatedAt: null });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={product} onOpen={onOpen} />);

  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();

  expect(onOpen).not.toHaveBeenCalled();
  expect(useCartStore.getState().items).toHaveLength(1);
});

test('plus quick-adds the default choice without opening the detail card', async () => {
  useCartStore.setState({ items: [], updatedAt: null });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={{ ...product, choice_options: [{ name: 'Острая', price: 350 }] }} onOpen={onOpen} />);

  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();

  expect(onOpen).not.toHaveBeenCalled();
  expect(useCartStore.getState().items[0]?.selected_choice).toBe('Острая');
});

test('plus opens configuration when required options cannot be inferred safely', async () => {
  useCartStore.setState({ items: [], updatedAt: null });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={{
    ...product,
    modifier_groups: [{
      id: 'sauce', name: 'Соус', required: true, minSelected: 1, maxSelected: 1,
      options: [{ id: 'red', name: 'Красный', priceDelta: 0, isDefault: false }]
    }]
  }} onOpen={onOpen} />);

  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();

  expect(onOpen).toHaveBeenCalledOnce();
  expect(useCartStore.getState().items).toHaveLength(0);
});
