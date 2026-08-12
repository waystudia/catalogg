import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { GroceryPickingPanel } from '../../src/features/order-picking/GroceryPickingPanel';
import type { Product } from '../../src/entities/models';

const product = (id: string, title: string): Product => ({
  id,
  title,
  price: 399,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_unlimited: true,
  stock_count: 10,
  category_id: 'category-1',
  pair_ids: [],
  sale_unit: 'weight',
  quantity_unit: 'gram',
  price_basis_quantity: 1000,
  minimum_quantity: 100,
  quantity_step: 50,
  allow_substitution: true
});

test('picker sees requested weight, records actual weight, and can open replacement flow', async () => {
  const changed = vi.fn();
  const screen = await render(
    <GroceryPickingPanel
      items={[{
        id: 'item-1',
        productId: 'milk',
        title: 'Бананы',
        quantity: 1,
        unitPrice: 180,
        lineTotal: 72,
        saleUnit: 'weight',
        quantityUnit: 'gram',
        requestedQuantity: 400,
        fulfilledQuantity: 0,
        fulfillmentState: 'pending'
      }]}
      products={[product('milk', 'Бананы'), product('dates', 'Финики')]}
      canPick
      onChanged={changed}
    />
  );

  await expect.element(screen.getByText('Заказано: 400 г')).toBeVisible();
  await expect.element(screen.getByLabelText('Фактический вес, г')).toHaveValue(400);
  await expect.element(screen.getByLabelText('Предложить замену')).toHaveValue('dates');
  await screen.getByRole('button', { name: 'Собрано' }).click();
  expect(changed).toHaveBeenCalledOnce();
});
