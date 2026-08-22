import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.BACKGROUND_MODEL_BASE_URL || 'http://127.0.0.1:4178').replace(/\/$/, '');
const expectedOrigin = new URL(baseUrl).origin;
const requests = [];
const browserErrors = [];
const failedRequests = [];
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(
    `${request.url()} ${request.failure()?.errorText ?? 'unknown error'}`
  ));
  await page.goto(`${baseUrl}/#/__shared-product-preview`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Добавить товар' }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Добавить товар' }).click();
  await page.getByRole('dialog', { name: 'Сканер штрих-кода' })
    .getByRole('button', { name: 'Закрыть' })
    .click();

  const productPath = process.env.BACKGROUND_MODEL_TEST_IMAGE || 'public/assets/logo/wayyaam-icon-192.png';
  const productPng = readFileSync(productPath);
  const productExtension = extname(productPath).toLowerCase();
  await page.getByLabel('Сфотографировать или выбрать фото').setInputFiles({
    name: basename(productPath),
    mimeType: productExtension === '.jpg' || productExtension === '.jpeg' ? 'image/jpeg' : 'image/png',
    buffer: productPng
  });
  try {
    const outcome = await Promise.race([
      page.getByText('Будет сохранено фото на белом фоне')
        .waitFor({ timeout: 120_000 })
        .then(() => 'processed'),
      page.getByRole('alert')
        .waitFor({ timeout: 120_000 })
        .then(() => 'failed')
    ]);
    assert.equal(outcome, 'processed');
    if (process.env.BACKGROUND_MODEL_OUTPUT_SCREENSHOT) {
      await page.getByRole('region', { name: 'Проверка фотографии товара' })
        .screenshot({ path: process.env.BACKGROUND_MODEL_OUTPUT_SCREENSHOT });
    }
  } catch (error) {
    const alerts = await page.getByRole('alert').allTextContents();
    throw new Error([
      error instanceof Error ? error.message : String(error),
      `alerts=${JSON.stringify(alerts)}`,
      `browserErrors=${JSON.stringify(browserErrors)}`,
      `failedRequests=${JSON.stringify(failedRequests)}`,
      `modelRequests=${JSON.stringify(requests.filter((url) => /models|ort-wasm/.test(url)))}`
    ].join('\n'));
  }

  const externalRequests = requests.filter((url) => {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin !== expectedOrigin
      : false;
  });
  assert.deepEqual(externalRequests, []);
  assert.ok(requests.some((url) => url.includes('/assets/models/isnet-general-use-onnx-5349b617/onnx/model_quantized.onnx')));
  assert.ok(requests.some((url) => url.includes('ort-wasm-simd-threaded.jsep')));
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedRequests, []);
  console.log(`self_hosted_background_runtime=passed requests=${requests.length} external=0`);
} finally {
  await browser.close();
}
