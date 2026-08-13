import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useState } from 'react';
import { groceryCategories, groceryProducts } from '../../src/data/groceryCatalog';
import { GroceryPosPage } from '../../src/features/grocery-operations/GroceryPosPage';
import { BarcodeCaptureDialog } from '../../src/features/grocery-operations/BarcodeCaptureDialog';
import { GroceryProductEditor } from '../../src/features/grocery-operations/GroceryProductEditor';
import { GroceryProductsPage } from '../../src/features/grocery-operations/GroceryProductsPage';
import { GroceryReceivingPage } from '../../src/features/grocery-operations/GroceryReceivingPage';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
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

test('POS repeated selection increments quantity and keeps the total visible in the reported compact desktop viewport', async () => {
  await page.viewport(951, 576);
  try {
    const submit = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <GroceryPosPage
        storeName="Финик"
        products={groceryProducts}
        categories={groceryCategories}
        paymentSettings={{
          ...defaultPaymentSettings,
          transferEnabled: true,
          allowCash: true,
          displayName: 'Исаев Магомед',
          bankName: 'Тестовый банк',
          transferNumber: '+7 999 000-00-00',
          qrUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E'
        }}
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

    await screen.getByLabelText('Получено наличными').fill('1000');
    await expect.element(screen.getByText('Сдача 475 ₽', { exact: true })).toBeVisible();

    await screen.getByRole('button', { name: /^Курага отборная/ }).click();
    await expect.element(screen.getByRole('heading', { name: 'Введите вес' })).toBeVisible();
    await screen.getByLabelText('Вес Курага отборная в граммах').fill('350');
    await screen.getByRole('button', { name: 'Добавить в заказ' }).click();
    await expect.element(screen.getByRole('spinbutton', { name: 'Количество Курага отборная' })).toHaveValue(350);

    await screen.getByRole('button', { name: 'Перевод' }).click();
    await expect.element(screen.getByRole('img', { name: 'QR-код для перевода магазину' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Создать заказ' })).toBeVisible();
    const cart = document.querySelector<HTMLElement>('.grocery-pos-cart')!;
    const footer = document.querySelector<HTMLElement>('.grocery-pos-cart > footer')!;
    const posRoot = document.querySelector<HTMLElement>('.grocery-pos-page')!;
    expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(cart.getBoundingClientRect().bottom + 1);
    expect(cart.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth + 1);
    expect(posRoot.scrollWidth).toBeLessThanOrEqual(posRoot.clientWidth + 1);
  } finally {
    await page.viewport(414, 896);
  }
});

test('POS scanner requests camera access immediately when the dialog opens', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  try {
    const screen = await render(
      <BarcodeCaptureDialog open autoStartCamera onClose={() => undefined} onScan={() => undefined} />
    );
    await expect.poll(() => getUserMedia.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole('button', { name: 'Включаем камеру…' })).toBeVisible();
  } finally {
    if (originalDescriptor) Object.defineProperty(navigator, 'mediaDevices', originalDescriptor);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

test('POS transfer explains a missing QR and normalizes legacy restaurant wording for a grocery store', async () => {
  const screen = await render(
    <GroceryPosPage
      storeName="Финик"
      products={groceryProducts}
      categories={groceryCategories}
      paymentSettings={{
        ...defaultPaymentSettings,
        transferEnabled: true,
        displayName: 'Исаев Магомед',
        bankName: 'Банк / перевод ресторану',
        transferNumber: '+7 999 000-00-00',
        qrUrl: ''
      }}
      readOnly={false}
      autoAddProduct={null}
      onConsumeAutoAdd={() => undefined}
      onCreateProduct={() => undefined}
      onSubmit={async () => undefined}
    />
  );

  await screen.getByRole('button', { name: 'Перевод' }).click();
  await expect.element(screen.getByText('QR-код не добавлен — загрузите его в «Настройки → Платежи».', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Банк / перевод магазину', { exact: true })).toBeVisible();
  expect(document.body.textContent).not.toContain('Банк / перевод ресторану');
});
