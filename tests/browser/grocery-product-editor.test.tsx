import { expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render } from 'vitest-browser-react';
import { DishForm } from '../../src/features/dish-editor/DishForm';
import { productToDish, type Dish } from '../../src/features/dish-editor/types';

function GroceryEditorHarness({ onPatch }: { onPatch: (patch: Partial<Dish>) => void }) {
  const [dish, setDish] = useState(() => productToDish(null, 'grocery-category'));
  return (
    <DishForm
      dish={dish}
      categories={[{
        id: 'grocery-category',
        name: 'Фрукты',
        image: '',
        icon: '',
        kind: 'food'
      }]}
      products={[]}
      error=""
      businessType="grocery"
      onChange={(patch) => {
        onPatch(patch);
        setDish((current) => ({ ...current, ...patch }));
      }}
      onSubmit={vi.fn()}
    />
  );
}

test('shows grocery SKU, barcode, weight and substitution controls in the shared product editor', async () => {
  const onChange = vi.fn();
  const screen = await render(<GroceryEditorHarness onPatch={onChange} />);

  await expect.element(screen.getByLabelText('Артикул SKU')).toBeVisible();
  await expect.element(screen.getByLabelText('Штрихкод')).toBeVisible();
  await screen.getByLabelText('Тип продажи').selectOptions('weight');
  expect(onChange).toHaveBeenCalledWith({ saleUnit: 'weight', pricingType: 'per_kg' });
  await expect.element(screen.getByText('Цена за 1 кг')).toBeVisible();
  await expect.element(screen.getByLabelText('Разрешить замену товара')).toBeVisible();
});
