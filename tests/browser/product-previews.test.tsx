import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { SafeImage } from '../../src/shared/SafeImage';
import { createCatalogPreview } from '../../src/shared/catalogPreview';

const full = `https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/catalog/media/${'a'.repeat(64)}.full-v1.jpg`;
const thumb = full.replace('.full-v1.jpg', '.thumb-v1.webp');
// Keep lazy fixtures offscreen: only the explicit error events below may fail them.
const offscreen = { width: 100, height: 100, style: { position: 'fixed' as const, top: 100000 } };

it('requests the lightweight variant only for a preview, and retries the full photo if it fails', async () => {
  const screen = await render(<SafeImage {...offscreen} src={full} preview alt="Блюдо" />);
  const image = screen.getByRole('img', { name: 'Блюдо' });
  // No real image request is needed to exercise the controlled fallback sequence.
  await expect.element(image).toHaveAttribute('src', thumb);
  image.element().dispatchEvent(new Event('error'));
  await expect.element(image).toHaveAttribute('src', full);
  image.element().dispatchEvent(new Event('error'));
  await expect.element(screen.getByRole('img', { name: 'Блюдо' })).toHaveClass('image-fallback');
});

it('keeps the large image for detail views and does not invent previews for old photos', async () => {
  const screen = await render(<><SafeImage {...offscreen} src={full} alt="Большое фото" /><SafeImage {...offscreen} src="/old.jpg" preview alt="Старое фото" /></>);
  await expect.element(screen.getByRole('img', { name: 'Большое фото' })).toHaveAttribute('src', full);
  await expect.element(screen.getByRole('img', { name: 'Старое фото' })).toHaveAttribute('src', '/old.jpg');
});

it('creates a genuinely smaller WebP at at most 400px without changing the source', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 900;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(1200, 900);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = (i * 37) % 251;
    pixels.data[i + 1] = (i * 17) % 239;
    pixels.data[i + 2] = (i * 7) % 233;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const source = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
  const preview = await createCatalogPreview(source);
  expect(preview).not.toBeNull();
  expect(preview!.type).toBe('image/webp');
  expect(preview!.size).toBeLessThan(source.size);
  const bitmap = await createImageBitmap(preview!);
  expect(bitmap.width).toBeGreaterThan(0);
  expect(bitmap.width).toBeLessThanOrEqual(400);
  expect(bitmap.height / bitmap.width).toBeCloseTo(0.75, 1);
  console.info(JSON.stringify({ originalBytes: source.size, previewBytes: preview!.size, width: bitmap.width, height: bitmap.height }));
  bitmap.close();
  expect(source.type).toBe('image/png');
  expect(await createCatalogPreview(new Blob(['broken'], { type: 'image/png' }))).toBeNull();
  expect(await createCatalogPreview(new Blob(['gif'], { type: 'image/gif' }))).toBeNull();
});
