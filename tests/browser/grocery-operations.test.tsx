import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useState } from 'react';
import { groceryCategories, groceryProducts } from '../../src/data/groceryCatalog';
import { GroceryPosPage } from '../../src/features/grocery-operations/GroceryPosPage';
import { BarcodeCaptureDialog } from '../../src/features/grocery-operations/BarcodeCaptureDialog';
import { GroceryProductEditor } from '../../src/features/grocery-operations/GroceryProductEditor';
import { playBarcodeScanSound } from '../../src/features/grocery-operations/barcodeScanFeedback';
import { GroceryProductsPage } from '../../src/features/grocery-operations/GroceryProductsPage';
import { GroceryReceivingPage } from '../../src/features/grocery-operations/GroceryReceivingPage';
import { SharedBarcodeScanner } from '../../src/features/shared-product-catalog/SharedBarcodeScanner';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import '../../src/features/grocery-operations/grocery-operations.css';
import '../../src/features/shared-product-catalog/shared-product-catalog.css';
import '../../src/pages/catalog-admin/catalog-admin.css';

const zxingFallback = vi.hoisted(() => ({
  detectedValue: '',
  stop: vi.fn(),
  preload: vi.fn().mockResolvedValue(undefined),
  start: vi.fn()
}));

vi.mock('../../src/features/grocery-operations/browserBarcodeDecoder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/features/grocery-operations/browserBarcodeDecoder')>();
  return {
    ...actual,
    preloadBrowserBarcodeDecoder: zxingFallback.preload,
    startBrowserBarcodeDecoder: zxingFallback.start.mockImplementation(
      async (_video: HTMLVideoElement, onDetected: (barcode: string) => boolean) => {
        const controls = { stop: zxingFallback.stop };
        if (zxingFallback.detectedValue && onDetected(zxingFallback.detectedValue)) controls.stop();
        return controls;
      }
    )
  };
});

function ProductEditorHarness({ photoProcessor }: { photoProcessor?: (file: File, onProgress: (progress: number) => void) => Promise<File> } = {}) {
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
      photoProcessor={photoProcessor}
    />
  );
}

const choosePhoto = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

test('grocery product cards become a readable two-column inventory layout on a short phone', async () => {
  await page.viewport(372, 576);
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
    const productCell = firstProduct.querySelector<HTMLElement>('.grocery-product-cell')!;
    const codeCell = firstProduct.querySelector<HTMLElement>('.grocery-code-cell')!;
    const metrics = [...firstProduct.querySelectorAll<HTMLElement>('.grocery-product-metric')];
    const status = firstProduct.querySelector<HTMLElement>('.grocery-product-status')!;
    const edit = firstProduct.querySelector<HTMLButtonElement>('.grocery-row-actions button')!;
    expect(firstProduct.getBoundingClientRect().left).toBeGreaterThanOrEqual(pageRoot.getBoundingClientRect().left);
    expect(firstProduct.getBoundingClientRect().right).toBeLessThanOrEqual(pageRoot.getBoundingClientRect().right + 1);
    expect(pageRoot.scrollWidth).toBeLessThanOrEqual(pageRoot.clientWidth + 1);
    expect(productCell.getBoundingClientRect().width).toBeGreaterThan(firstProduct.getBoundingClientRect().width * 0.8);
    expect(codeCell.getBoundingClientRect().width).toBeGreaterThan(firstProduct.getBoundingClientRect().width * 0.8);
    expect(metrics).toHaveLength(4);
    expect(Math.abs(metrics[0].getBoundingClientRect().top - metrics[1].getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics[2].getBoundingClientRect().top - metrics[3].getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(metrics[0].getBoundingClientRect().right).toBeLessThanOrEqual(metrics[1].getBoundingClientRect().left);
    expect(status.getBoundingClientRect().width).toBeGreaterThan(firstProduct.getBoundingClientRect().width * 0.8);
    expect(edit.getBoundingClientRect().right).toBeLessThanOrEqual(firstProduct.getBoundingClientRect().right - 8);
    expect(getComputedStyle(document.querySelector<HTMLElement>('.grocery-products-table')!).overflowX).toBe('visible');
  } finally {
    await page.viewport(414, 896);
  }
});

test('grocery products table scrolls horizontally inside the reported compact desktop workspace', async () => {
  await page.viewport(1040, 576);
  try {
    const screen = await render(
      <main className="restaurant-admin-shell business-workspace-shell">
        <aside className="restaurant-admin-sidebar business-workspace-sidebar" />
        <div className="restaurant-admin-main business-workspace-main">
          <section className="restaurant-admin-content business-workspace-content">
            <GroceryProductsPage
              products={groceryProducts}
              categories={groceryCategories}
              readOnly={false}
              publicUrl="/#/finik"
              onEdit={() => undefined}
              onCreate={() => undefined}
              onReceiving={() => undefined}
            />
          </section>
        </div>
      </main>
    );

    const table = screen.getByRole('region', { name: 'Таблица товаров' }).element();
    expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
    expect(getComputedStyle(table).overflowX).toBe('auto');
    table.scrollLeft = table.scrollWidth;
    expect(table.scrollLeft).toBeGreaterThan(0);
  } finally {
    await page.viewport(414, 896);
  }
});

test('POS product details stay readable over a photo that fills the whole card', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(
      <GroceryPosPage
        storeName="Финик"
        products={groceryProducts}
        categories={groceryCategories}
        paymentSettings={defaultPaymentSettings}
        readOnly={false}
        autoAddProduct={null}
        onConsumeAutoAdd={() => undefined}
        onCreateProduct={() => undefined}
        onSubmit={async () => undefined}
      />
    );

    const card = screen.getByRole('button', { name: /^Финики Тунис/ }).element();
    const photo = card.querySelector<HTMLImageElement>('img')!;
    const title = screen.getByText('Финики Тунис', { exact: true }).element();
    const inventory = screen.getByText('24 кг на складе', { exact: true }).element();
    const price = screen.getByText('470 ₽ / кг', { exact: true }).element();
    const cardRect = card.getBoundingClientRect();
    const photoRect = photo.getBoundingClientRect();

    expect(Math.abs(photoRect.left - cardRect.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.top - cardRect.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.right - cardRect.right)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.bottom - cardRect.bottom)).toBeLessThanOrEqual(2);
    for (const detail of [title, inventory, price]) {
      const detailRect = detail.getBoundingClientRect();
      expect(detailRect.left).toBeGreaterThanOrEqual(photoRect.left);
      expect(detailRect.right).toBeLessThanOrEqual(photoRect.right);
      expect(detailRect.top).toBeGreaterThanOrEqual(photoRect.top);
      expect(detailRect.bottom).toBeLessThanOrEqual(photoRect.bottom);
    }
    expect(getComputedStyle(title).color).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(price).color).toBe('rgb(255, 255, 255)');
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

test('new grocery product prepares a white-background photo before the name fields', async () => {
  const photoProcessor = vi.fn(async (_file: File, onProgress: (progress: number) => void) => {
    onProgress(70);
    return new File(['white'], 'product-white.jpg', { type: 'image/jpeg' });
  });
  const screen = await render(<ProductEditorHarness photoProcessor={photoProcessor} />);
  const photoInput = screen.getByLabelText('Сфотографировать товар').element() as HTMLInputElement;
  const original = new File(['original'], 'product.jpg', { type: 'image/jpeg' });

  choosePhoto(photoInput, original);

  await expect.element(screen.getByRole('img', { name: 'Товар на белом фоне' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Белый фон/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('button', { name: 'Подправить кистью' })).toBeVisible();
  expect(photoProcessor).toHaveBeenCalledWith(original, expect.any(Function));
  const photoSection = screen.getByRole('heading', { name: 'Сначала фотография товара' }).element().closest('section')!;
  const titleField = screen.getByLabelText('Название товара').element();
  expect(photoSection.compareDocumentPosition(titleField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('successful barcode feedback plays the scanner sound without delaying completion', async () => {
  const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
  const start = vi.fn();
  const stop = vi.fn();
  const frequency = { setValueAtTime: vi.fn() };
  const gainValue = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  class FakeAudioContext {
    currentTime = 1;
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    createGain = () => ({ gain: gainValue, connect: vi.fn() });
    createOscillator = () => ({ type: 'square', frequency, connect: vi.fn(), start, stop });
  }
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
  try {
    playBarcodeScanSound();
    await expect.poll(() => start.mock.calls.length).toBe(1);
    expect(stop).toHaveBeenCalledOnce();
    expect(frequency.setValueAtTime).toHaveBeenCalledTimes(2);
  } finally {
    if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext);
    else Reflect.deleteProperty(window, 'AudioContext');
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

test('POS preloads the fast iPhone decoder before the cashier opens the camera', async () => {
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  Reflect.deleteProperty(window, 'BarcodeDetector');
  zxingFallback.preload.mockClear();
  try {
    await render(
      <GroceryPosPage
        storeName="Финик"
        products={groceryProducts}
        categories={groceryCategories}
        paymentSettings={{ ...defaultPaymentSettings, allowCash: true }}
        readOnly={false}
        autoAddProduct={null}
        onConsumeAutoAdd={() => undefined}
        onCreateProduct={() => undefined}
        onSubmit={async () => undefined}
      />
    );

    await expect.poll(() => zxingFallback.preload.mock.calls.length).toBe(1);
  } finally {
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
  }
});

test('product scanner recognizes a barcode through the camera when iPhone has no native BarcodeDetector', async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStream());
  const onScan = vi.fn();
  zxingFallback.detectedValue = '4600494600012';
  zxingFallback.stop.mockClear();
  zxingFallback.preload.mockClear();
  zxingFallback.start.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Reflect.deleteProperty(window, 'BarcodeDetector');

  try {
    const screen = await render(
      <BarcodeCaptureDialog open autoStartCamera onClose={() => undefined} onScan={onScan} />
    );

    await expect.poll(() => onScan.mock.calls.length).toBe(1);
    expect(onScan).toHaveBeenCalledWith('4600494600012');
    expect(zxingFallback.stop.mock.calls.length).toBeGreaterThan(0);
    expect(zxingFallback.preload).toHaveBeenCalledOnce();
    expect(zxingFallback.start).toHaveBeenCalledOnce();
    await expect.element(screen.getByText(/автораспознавание недоступно/i)).not.toBeInTheDocument();
  } finally {
    zxingFallback.detectedValue = '';
    play.mockRestore();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
  }
});

test('phone scanner uses the whole camera frame and shows only a square orientation-free guide', async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStream());
  zxingFallback.detectedValue = '';
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Reflect.deleteProperty(window, 'BarcodeDetector');
  await page.viewport(390, 844);

  try {
    const screen = await render(
      <BarcodeCaptureDialog open autoStartCamera onClose={() => undefined} onScan={() => undefined} />
    );

    await expect.element(screen.getByText(/быстрое сканирование/i)).toBeVisible();
    const guide = document.querySelector<HTMLElement>('.grocery-barcode-dialog__guide')!;
    expect(Math.abs(guide.getBoundingClientRect().width - guide.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({
        facingMode: { ideal: 'environment' },
        frameRate: { ideal: 30, max: 30 }
      })
    }));
  } finally {
    await page.viewport(414, 896);
    play.mockRestore();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
  }
});

test('shared product scanner also recognizes a barcode on iPhone instead of showing an unsupported-browser error', async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const getUserMedia = vi.fn().mockResolvedValue(new MediaStream());
  const onDetected = vi.fn();
  zxingFallback.detectedValue = '4600494600012';
  zxingFallback.stop.mockClear();
  zxingFallback.preload.mockClear();
  zxingFallback.start.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Reflect.deleteProperty(window, 'BarcodeDetector');

  try {
    const screen = await render(<SharedBarcodeScanner onDetected={onDetected} onClose={() => undefined} />);

    await expect.poll(() => onDetected.mock.calls.length).toBe(1);
    expect(onDetected).toHaveBeenCalledWith('4600494600012');
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(zxingFallback.stop.mock.calls.length).toBeGreaterThan(0);
    expect(zxingFallback.preload).toHaveBeenCalledOnce();
    expect(zxingFallback.start).toHaveBeenCalledOnce();
    await expect.element(screen.getByText('Камера готова')).toBeVisible();
    const guide = document.querySelector<HTMLElement>('.shared-catalog-scanner__camera > span')!;
    expect(Math.abs(guide.getBoundingClientRect().width - guide.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
    await expect.element(screen.getByText(/браузер не поддерживает сканирование/i)).not.toBeInTheDocument();
  } finally {
    zxingFallback.detectedValue = '';
    play.mockRestore();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
  }
});

test('closing the shared scanner fully releases the iPhone camera element and every video track', async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const stop = vi.fn();
  const stream = new MediaStream();
  Object.defineProperty(stream, 'getTracks', { configurable: true, value: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) }
  });
  Reflect.deleteProperty(window, 'BarcodeDetector');
  zxingFallback.detectedValue = '';

  const ScannerHarness = () => {
    const [open, setOpen] = useState(true);
    return open
      ? <SharedBarcodeScanner onDetected={() => undefined} onClose={() => setOpen(false)} />
      : <p>Сканер закрыт</p>;
  };

  try {
    const screen = await render(<ScannerHarness />);
    await expect.element(screen.getByText('Камера готова')).toBeVisible();
    const video = document.querySelector<HTMLVideoElement>('.shared-catalog-scanner video')!;
    expect(video.srcObject).toBe(stream);

    await screen.getByRole('button', { name: 'Закрыть' }).click();

    await expect.element(screen.getByText('Сканер закрыт')).toBeVisible();
    await expect.poll(() => stop.mock.calls.length).toBe(1);
    expect(pause.mock.instances).toContain(video);
    expect(video.srcObject).toBeNull();
  } finally {
    play.mockRestore();
    pause.mockRestore();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
  }
});

test('shared scanner keeps the same square geometry when iPhone camera permission resolves', async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  const originalBarcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  let resolveCamera!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => {
    resolveCamera = resolve;
  }));
  zxingFallback.detectedValue = '';
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Reflect.deleteProperty(window, 'BarcodeDetector');
  await page.viewport(390, 844);

  try {
    const screen = await render(<SharedBarcodeScanner onDetected={() => undefined} onClose={() => undefined} />);
    await expect.element(screen.getByText('Разрешите доступ к камере')).toBeVisible();

    const panel = document.querySelector<HTMLElement>('.shared-catalog-scanner__panel')!;
    const camera = document.querySelector<HTMLElement>('.shared-catalog-scanner__camera')!;
    const close = screen.getByRole('button', { name: 'Закрыть' }).element();
    const beforePanel = panel.getBoundingClientRect();
    const beforeCamera = camera.getBoundingClientRect();

    expect(Math.abs(beforeCamera.width - beforeCamera.height)).toBeLessThanOrEqual(1);
    expect(close.getBoundingClientRect().bottom).toBeLessThanOrEqual(beforeCamera.top);
    expect(close.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    resolveCamera(new MediaStream());
    await expect.element(screen.getByText('Камера готова')).toBeVisible();
    const afterPanel = panel.getBoundingClientRect();
    const afterCamera = camera.getBoundingClientRect();

    expect(Math.abs(afterPanel.width - beforePanel.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterPanel.height - beforePanel.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterCamera.width - beforeCamera.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterCamera.height - beforeCamera.height)).toBeLessThanOrEqual(1);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  } finally {
    await page.viewport(414, 896);
    play.mockRestore();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    if (originalBarcodeDetector) Object.defineProperty(window, 'BarcodeDetector', originalBarcodeDetector);
    else Reflect.deleteProperty(window, 'BarcodeDetector');
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
