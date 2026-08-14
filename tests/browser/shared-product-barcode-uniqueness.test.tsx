import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { SharedProductCatalogPage } from '../../src/features/shared-product-catalog/SharedProductCatalogPage';

test('a merchant cannot create another product with an existing barcode', async () => {
  const screen = await render(
    <SharedProductCatalogPage mode="merchant" catalogId="demo-store" demo />
  );

  await screen.getByRole('button', { name: 'Добавить товар' }).click();
  await screen.getByRole('dialog', { name: 'Сканер штрих-кода' }).getByRole('button', { name: 'Закрыть' }).click();
  await screen.getByRole('textbox', { name: 'Штрих‑код' }).fill('5449-0000-5422-7');
  await screen.getByRole('textbox', { name: 'Название' }).fill('Другой товар');
  await screen.getByRole('button', { name: 'Отправить в общую базу' }).click();

  await expect.element(screen.getByText(/уже принадлежит товару «Coca-Cola Original Taste»/)).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Coca-Cola Original Taste' })).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Другой товар' })).not.toBeInTheDocument();
});
