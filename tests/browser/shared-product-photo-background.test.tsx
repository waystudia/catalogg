import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { SharedProductCatalogPage } from '../../src/features/shared-product-catalog/SharedProductCatalogPage';
import { ProductPhotoCamera } from '../../src/features/shared-product-catalog/ProductPhotoCamera';
import { ProductPhotoRefinementEditor } from '../../src/features/shared-product-catalog/ProductPhotoRefinementEditor';
import {
  placeCutoutOnWhite,
  refineProductPhotoBackground
} from '../../src/features/shared-product-catalog/productPhotoBackground';

const choosePhoto = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const canvasFile = async (
  name: string,
  draw: (context: CanvasRenderingContext2D) => void
) => {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 20;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  draw(context);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (nextBlob) => nextBlob ? resolve(nextBlob) : reject(new Error('Could not create test image')),
    'image/png'
  ));
  return new File([blob], name, { type: 'image/png' });
};

test('a product photo is processed automatically and the merchant chooses which version to save', async () => {
  let finishProcessing: ((file: File) => void) | undefined;
  const processed = new File(['white-background'], 'product-white.jpg', { type: 'image/jpeg' });
  const photoPreloader = vi.fn(async () => undefined);
  const photoProcessor = vi.fn(() => new Promise<File>((resolve) => {
    finishProcessing = resolve;
  }));
  const screen = await render(
    <SharedProductCatalogPage
      mode="merchant"
      catalogId="demo-store"
      demo
      photoProcessor={photoProcessor}
      photoPreloader={photoPreloader}
    />
  );

  await screen.getByRole('button', { name: 'Добавить товар' }).click();
  expect(photoPreloader).toHaveBeenCalledOnce();
  await expect.element(screen.getByRole('dialog', { name: 'Сканер штрих-кода' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Сканировать штрих‑код' })).toBeVisible();
  await screen.getByRole('dialog', { name: 'Сканер штрих-кода' }).getByRole('button', { name: 'Закрыть' }).click();
  await expect.element(screen.getByRole('button', { name: 'Сфотографировать товар' })).toBeVisible();
  await screen.getByRole('button', { name: 'Сфотографировать товар' }).click();
  const cameraDialog = screen.getByRole('dialog', { name: 'Фотографирование товара' });
  await expect.element(cameraDialog).toBeVisible();
  await expect.element(cameraDialog.getByText('Поместите товар в рамку')).toBeVisible();
  await cameraDialog.getByRole('button', { name: 'Закрыть' }).first().click();

  const original = new File(['original'], 'product.jpg', { type: 'image/jpeg' });
  choosePhoto(
    screen.getByLabelText('Сфотографировать или выбрать фото').element() as HTMLInputElement,
    original
  );

  await expect.element(screen.getByText('Убираем фон и готовим белый вариант…')).toBeVisible();
  await expect.element(screen.getByText('Оригинал уже выбран — товар можно сохранить сразу.')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Отправить в общую базу' })).toBeEnabled();
  expect(photoProcessor).toHaveBeenCalledWith(original, expect.any(Function));

  finishProcessing?.(processed);

  await expect.element(screen.getByRole('img', { name: 'Оригинальная фотография товара' })).toBeVisible();
  await expect.element(screen.getByRole('img', { name: 'Товар на белом фоне' })).toBeVisible();
  await expect.element(screen.getByText('Будет сохранено фото на белом фоне')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Подправить кистью' })).toBeVisible();

  await screen.getByRole('button', { name: 'Оставить оригинал' }).click();
  await expect.element(screen.getByText('Будет сохранена оригинальная фотография')).toBeVisible();

  await screen.getByRole('button', { name: 'Использовать белый фон' }).click();
  await expect.element(screen.getByText('Будет сохранено фото на белом фоне')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Выбрать другое фото' })).toBeVisible();
});

test('rough foreground and background strokes guide the system to the real product edge', async () => {
  const original = await canvasFile('can.png', (context) => {
    context.fillStyle = '#d8c7ac';
    context.fillRect(0, 0, 40, 20);
    context.fillStyle = '#ef1b1b';
    context.fillRect(20, 0, 20, 20);
  });
  const automatic = await canvasFile('can-white-background.png', (context) => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 40, 20);
    context.fillStyle = '#ef1b1b';
    context.fillRect(30, 0, 10, 20);
  });

  const result = await refineProductPhotoBackground(original, automatic, [
    { kind: 'foreground', points: [{ x: 0.56, y: 0.25 }, { x: 0.67, y: 0.75 }] },
    { kind: 'background', points: [{ x: 0.12, y: 0.25 }, { x: 0.12, y: 0.75 }] }
  ]);
  const bitmap = await createImageBitmap(result);
  const output = document.createElement('canvas');
  output.width = bitmap.width;
  output.height = bitmap.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(bitmap, 0, 0);

  const background = context.getImageData(5, 10, 1, 1).data;
  const restoredProduct = context.getImageData(23, 10, 1, 1).data;
  const snappedOutsideEdge = context.getImageData(18, 10, 1, 1).data;

  expect([...background]).toEqual([255, 255, 255, 255]);
  expect(restoredProduct[0]).toBeGreaterThan(220);
  expect(restoredProduct[1]).toBeLessThan(70);
  expect(restoredProduct[2]).toBeLessThan(70);
  expect([...snappedOutsideEdge]).toEqual([255, 255, 255, 255]);
  expect(result.name).toBe('can-refined-white-background.jpg');
});

test('the brush collects rough hints and applies a system-refined result', async () => {
  await page.viewport(372, 576);
  try {
  const original = await canvasFile('can.png', (context) => {
    context.fillStyle = '#d8c7ac';
    context.fillRect(0, 0, 40, 20);
  });
  const automatic = await canvasFile('can-white-background.png', (context) => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 40, 20);
  });
  const refined = new File(['refined'], 'can-refined.jpg', { type: 'image/jpeg' });
  const refine = vi.fn(async () => refined);
  const onApply = vi.fn();
  const screen = await render(
    <ProductPhotoRefinementEditor
      original={original}
      automatic={automatic}
      refine={refine}
      onApply={onApply}
      onCancel={() => undefined}
    />
  );

  await expect.element(screen.getByRole('dialog', { name: 'Уточнение границы товара' })).toBeVisible();
  await expect.element(screen.getByText('Проведите примерно внутри товара — система сама найдёт ближайшую границу.')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Уточнить автоматически' })).toBeDisabled();
  const dialog = screen.getByRole('dialog', { name: 'Уточнение границы товара' }).element();
  expect(dialog.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);

  const canvas = screen.getByLabelText('Кисть уточнения фотографии').element() as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: rect.left + rect.width * 0.55, clientY: rect.top + rect.height * 0.25 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: rect.left + rect.width * 0.65, clientY: rect.top + rect.height * 0.75 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: rect.left + rect.width * 0.65, clientY: rect.top + rect.height * 0.75 }));

  await screen.getByRole('button', { name: 'Фон' }).click();
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.2 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.8 }));

  await expect.element(screen.getByRole('button', { name: 'Уточнить автоматически' })).toBeEnabled();
  await screen.getByRole('button', { name: 'Уточнить автоматически' }).click();

  expect(refine).toHaveBeenCalledWith(original, automatic, [
    expect.objectContaining({ kind: 'foreground' }),
    expect.objectContaining({ kind: 'background' })
  ]);
  expect(onApply).toHaveBeenCalledWith(refined);
  } finally {
    await page.viewport(414, 896);
  }
});

test('failed background removal keeps the original photo available for saving', async () => {
  const photoProcessor = vi.fn(async () => {
    throw new Error('model unavailable');
  });
  const screen = await render(
    <SharedProductCatalogPage
      mode="platform"
      demo
      photoProcessor={photoProcessor}
      photoPreloader={async () => undefined}
    />
  );

  await screen.getByRole('button', { name: 'Добавить товар' }).click();
  await screen.getByRole('dialog', { name: 'Сканер штрих-кода' }).getByRole('button', { name: 'Закрыть' }).click();
  const original = new File(['original'], 'product.png', { type: 'image/png' });
  choosePhoto(
    screen.getByLabelText('Сфотографировать или выбрать фото').element() as HTMLInputElement,
    original
  );

  await expect.element(screen.getByRole('alert')).toHaveTextContent(
    'Не удалось автоматически убрать фон. Оригинал сохранён — можно продолжить или выбрать другое фото.'
  );
  await expect.element(screen.getByText('Будет сохранена оригинальная фотография')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Добавить в общую базу' })).toBeEnabled();
});

test('a transparent cutout is exported as a compact image with a real white background', async () => {
  const source = document.createElement('canvas');
  source.width = 40;
  source.height = 20;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('Canvas is unavailable');
  sourceContext.clearRect(0, 0, 40, 20);
  sourceContext.fillStyle = '#ef1b1b';
  sourceContext.fillRect(20, 0, 20, 20);

  const cutout = await new Promise<Blob>((resolve, reject) => source.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not create test image')),
    'image/png'
  ));
  const result = await placeCutoutOnWhite(cutout, 'crisps.png');

  expect(result.name).toBe('crisps-white-background.jpg');
  expect(result.type).toBe('image/jpeg');

  const bitmap = await createImageBitmap(result);
  const output = document.createElement('canvas');
  output.width = bitmap.width;
  output.height = bitmap.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Canvas is unavailable');
  outputContext.drawImage(bitmap, 0, 0);
  const whitePixel = outputContext.getImageData(2, 10, 1, 1).data;
  const redPixel = outputContext.getImageData(37, 10, 1, 1).data;

  expect([...whitePixel]).toEqual([255, 255, 255, 255]);
  expect(output.width).toBe(output.height);
  const centerPixel = outputContext.getImageData(output.width / 2, output.height / 2, 1, 1).data;
  expect(centerPixel[0]).toBeGreaterThan(220);
  expect(centerPixel[1]).toBeLessThan(60);
  expect(centerPixel[2]).toBeLessThan(60);
  expect(redPixel[3]).toBe(255);
});

test('soft background residue is removed before the product is centered on pure white', async () => {
  const source = document.createElement('canvas');
  source.width = 80;
  source.height = 60;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('Canvas is unavailable');
  sourceContext.clearRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = '#5a5856';
  sourceContext.fillRect(4, 35, 36, 14);
  sourceContext.fillStyle = '#ef1b1b';
  sourceContext.fillRect(34, 10, 12, 40);

  const cutout = await new Promise<Blob>((resolve, reject) => source.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not create test image')),
    'image/png'
  ));
  const originalSource = document.createElement('canvas');
  originalSource.width = source.width;
  originalSource.height = source.height;
  const originalContext = originalSource.getContext('2d');
  if (!originalContext) throw new Error('Canvas is unavailable');
  originalContext.fillStyle = '#5a5856';
  originalContext.fillRect(0, 0, originalSource.width, originalSource.height);
  originalContext.fillStyle = '#ef1b1b';
  originalContext.fillRect(34, 10, 12, 40);
  const originalBlob = await new Promise<Blob>((resolve, reject) => originalSource.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not create original test image')),
    'image/png'
  ));
  const result = await placeCutoutOnWhite(cutout, 'pepper.png', 200, originalBlob);
  const bitmap = await createImageBitmap(result);
  const output = document.createElement('canvas');
  output.width = bitmap.width;
  output.height = bitmap.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Canvas is unavailable');
  outputContext.drawImage(bitmap, 0, 0);

  expect(output.width).toBe(200);
  expect(output.height).toBe(200);
  const leftResidue = outputContext.getImageData(35, 130, 1, 1).data;
  const centeredProduct = outputContext.getImageData(100, 100, 1, 1).data;
  expect(leftResidue[0]).toBeGreaterThan(248);
  expect(leftResidue[1]).toBeGreaterThan(248);
  expect(leftResidue[2]).toBeGreaterThan(248);
  expect(centeredProduct[0]).toBeGreaterThan(220);
  expect(centeredProduct[1]).toBeLessThan(70);
  expect(centeredProduct[2]).toBeLessThan(70);
});

test('product camera shows a square guide and captures the centered frame', async () => {
  const onCapture = vi.fn();
  const onClose = vi.fn();
  const screen = await render(
    <ProductPhotoCamera
      onCapture={onCapture}
      onClose={onClose}
      cameraStreamFactory={async () => new MediaStream()}
    />
  );

  await expect.element(screen.getByRole('dialog', { name: 'Фотографирование товара' })).toBeVisible();
  await expect.element(screen.getByText('Поместите товар в рамку')).toBeVisible();
  await expect.element(screen.getByText('Оставьте немного воздуха по краям')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Сделать снимок' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Выбрать из галереи' })).toBeVisible();
});
