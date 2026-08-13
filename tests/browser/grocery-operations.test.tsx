import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useState } from 'react';
import { groceryCategories, groceryProducts } from '../../src/data/groceryCatalog';
import { GroceryPosPage } from '../../src/features/grocery-operations/GroceryPosPage';
import { GroceryProductEditor } from '../../src/features/grocery-operations/GroceryProductEditor';
import { GroceryProductsPage } from '../../src/features/grocery-operations/GroceryProductsPage';
import { GroceryReceivingPage } from '../../src/features/grocery-operations/GroceryReceivingPage';
import '../../src/features/grocery-operations/grocery-operations.css';

function ProductEditorHarness() {
  const [barcode, setBarcode] = useState('');
  return (
    <GroceryProductEditor
      open
      product={null}
      initialBarcode={barcode}
      categories={groceryCategories}
      barcodeExists={() => false}
      onRequestScan={() => setBarcode('4609999999991')}
      onClose={() => undefined}
      onSave={() => undefined}
    />
  );
}

test('grocery product cards remain inside a phone viewport while preserving every operation', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(
      <GroceryProductsPage
        products={groceryProducts}
        categories={groceryCategories}
        readOnly={false}
        publicUrl="/#/finik"
        onEdit={() => undefined}
        onCreate={() => undefined}
        onReceiving={() => undefined}
      />
    );

    await expect.element(screen.getByRole('heading', { name: 'Товары' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Новый товар' })).toBeVisible();
    const pageRoot = document.querySelector<HTMLElement>('.grocery-operations-page')!;
    const firstProduct = document.querySelector<HTMLElement>('.grocery-products-table article')!;
    expect(firstProduct.getBoundingClientRect().left).toBeGreaterThanOrEqual(pageRoot.getBoundingClientRect().left);
    expect(firstProduct.getBoundingClientRect().right).toBeLessThanOrEqual(pageRoot.getBoundingClientRect().right + 1);
    expect(pageRoot.scrollWidth).toBeLessThanOrEqual(pageRoot.clientWidth + 1);
  } finally {
    await page.viewport(414, 896);
  }
});

test('new product drawer keeps typed data when a scanner fills the barcode on a phone', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(<ProductEditorHarness />);
    const title = screen.getByLabelText('Название товара');
    await title.fill('Новый тестовый товар');
    await screen.getByRole('button', { name: 'Сканировать' }).click();

    await expect.element(title).toHaveValue('Новый тестовый товар');
    await expect.element(screen.getByLabelText('Штрих-код')).toHaveValue('4609999999991');
    await expect.element(screen.getByRole('button', { name: 'Сохранить товар' })).toBeVisible();
    expect(document.querySelector<HTMLElement>('.grocery-product-drawer')!.scrollWidth)
      .toBeLessThanOrEqual(document.querySelector<HTMLElement>('.grocery-product-drawer')!.clientWidth + 1);
  } finally {
    await page.viewport(414, 896);
  }
});

test('receiving finds a barcode and a repeated scan increments the same line', async () => {
  await page.viewport(820, 900);
  try {
    const createProduct = vi.fn();
    const screen = await render(
      <GroceryReceivingPage
        products={groceryProducts}
        readOnly={false}
        autoAddProduct={null}
        onConsumeAutoAdd={() => undefined}
        onCreateProduct={createProduct}
        onPost={async () => undefined}
      />
    );

    const scan = async (barcode: string) => {
      await screen.getByRole('button', { name: 'Сканировать товар' }).click();
      await screen.getByLabelText('Штрих-код вручную').fill(barcode);
      await screen.getByRole('button', { name: 'Найти товар' }).click();
    };

    await scan('4600494600018');
    await scan('4600494600018');
    await expect.element(screen.getByRole('spinbutton', { name: 'шт' }).first()).toHaveValue(2);
    await expect.element(screen.getByText('Pepsi 1,5 л', { exact: true })).toBeVisible();

    const receivingSearch = screen.getByPlaceholder('Начните вводить название, артикул или штрих‑код');
    await receivingSearch.fill('4600494600018');
    await receivingSearch.click();
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByRole('spinbutton', { name: 'шт' }).first()).toHaveValue(3);

    await scan('9999999999999');
    expect(createProduct).toHaveBeenCalledWith('9999999999999');
  } finally {
    await page.viewport(414, 896);
  }
});

test('POS repeated selection increments quantity and remains usable on desktop', async () => {
  await page.viewport(1440, 900);
  try {
    const submit = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <GroceryPosPage
        storeName="Финик"
        products={groceryProducts}
        categories={groceryCategories}
        readOnly={false}
        autoAddProduct={null}
        onConsumeAutoAdd={() => undefined}
        onCreateProduct={() => undefined}
        onSubmit={submit}
      />
    );

    const pepsi = screen.getByRole('button', { name: /^Pepsi 1,5 л/ });
    await pepsi.click();
    await pepsi.click();
    await expect.element(screen.getByRole('spinbutton', { name: 'Количество Pepsi 1,5 л' })).toHaveValue(2);
    const posSearch = screen.getByPlaceholder('Товар, артикул или штрих‑код');
    await posSearch.fill('4600494600018');
    await posSearch.click();
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByRole('spinbutton', { name: 'Количество Pepsi 1,5 л' })).toHaveValue(3);
    await expect.element(screen.getByText('525 ₽', { exact: true }).last()).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Создать заказ' })).toBeEnabled();
  } finally {
    await page.viewport(414, 896);
  }
});
