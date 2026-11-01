import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Product } from '../../src/entities/models';
import { ProductTile } from '../../src/features/catalog/ProductTile';
import { selectCartTotal, useAuthStore, useCartStore } from '../../src/features/stores';
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

test('plus shows the existing variant panel and adds only after choosing', async () => {
  useCartStore.setState({ items: [], updatedAt: null });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={{ ...product, choice_options: [{ name: 'Острая', price: 350 }] }} onOpen={onOpen} />);

  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();

  expect(onOpen).not.toHaveBeenCalled();
  expect(useCartStore.getState().items).toHaveLength(0);
  await expect.element(screen.getByRole('dialog', { name: 'Варианты Пиде с мясом' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Острая/ })).toHaveFocus();
  await screen.getByRole('button', { name: /Острая/ }).click();
  expect(useCartStore.getState().items[0]?.selected_choice).toBe('Острая');
});

test('plus opens configuration when required options cannot be inferred safely', async () => {
  useCartStore.setState({ items: [], updatedAt: null });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={{
    ...product,
    choice_options: [{ name: 'Острая', price: 350 }],
    modifier_groups: [{
      id: 'sauce', name: 'Соус', required: true, minSelected: 1, maxSelected: 1,
      options: [{ id: 'red', name: 'Красный', priceDelta: 0, isDefault: false }]
    }]
  }} onOpen={onOpen} />);

  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();

  expect(onOpen).toHaveBeenCalledOnce();
  expect(useCartStore.getState().items).toHaveLength(0);
});


test('plus reopens variants for a dish already in the cart without silently increasing the old choice', async () => {
  const withChoices = { ...product, choice_options: [{ name: 'Острая', price: 350 }, { name: 'Неострая', price: 400 }] };
  useCartStore.setState({ items: [{ product: withChoices, quantity: 2, selected_choice: 'Острая' }] });
  const onOpen = vi.fn();
  const screen = await render(<ProductTile product={withChoices} onOpen={onOpen} />);
  await screen.getByRole('button', { name: 'Добавить Пиде с мясом' }).click();
  expect(useCartStore.getState().items[0].quantity).toBe(2);
  await screen.getByRole('button', { name: /^Неострая/ }).click();
  expect(onOpen).not.toHaveBeenCalled();
  expect(useCartStore.getState().items.map(item => [item.selected_choice, item.quantity])).toEqual([['Острая', 2], ['Неострая', 1]]);
  expect(selectCartTotal(useCartStore.getState().items)).toBe(1100);
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
});


test('dismissing the variant panel leaves the cart unchanged and returns focus to plus', async () => {
  useCartStore.setState({ items: [] });
  const screen = await render(<ProductTile product={{ ...product, choice_options: [{ name: 'Острая', price: 350 }] }} onOpen={vi.fn()} />);
  const plus = screen.getByRole('button', { name: 'Добавить Пиде с мясом' });
  await plus.click();
  const option = screen.getByRole('button', { name: /Острая/ });
  await expect.element(option).toHaveFocus();
  option.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await expect.element(plus).toHaveFocus();
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
  expect(useCartStore.getState().items).toHaveLength(0);
});
