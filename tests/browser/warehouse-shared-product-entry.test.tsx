import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { GroceryWarehousePage } from '../../src/features/grocery-operations/GroceryWarehousePage';

test('a grocery warehouse opens the shared product catalog', async () => {
  const onOpenSharedProducts = vi.fn();
  const screen = await render(
    <GroceryWarehousePage
      products={[]}
      movements={[]}
      readOnly={false}
      onReceiving={vi.fn()}
      onEditProduct={vi.fn()}
      onOpenSharedProducts={onOpenSharedProducts}
    />
  );

  await screen.getByRole('button', { name: 'База товаров' }).click();

  expect(onOpenSharedProducts).toHaveBeenCalledOnce();
});

test('a warehouse without a shared catalog callback does not show a dead navigation button', async () => {
  const screen = await render(
    <GroceryWarehousePage
      products={[]}
      movements={[]}
      readOnly={false}
      onReceiving={vi.fn()}
      onEditProduct={vi.fn()}
    />
  );

  await expect.element(screen.getByRole('button', { name: 'База товаров' })).not.toBeInTheDocument();
});
