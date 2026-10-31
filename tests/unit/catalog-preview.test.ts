import { expect, it, vi } from 'vitest';
vi.mock('browser-image-compression', () => ({ default: vi.fn() }));
import imageCompression from 'browser-image-compression';
import { createCatalogPreview } from '../../src/shared/catalogPreview';

it('requests a 400px WebP within 45KiB and leaves its source intact', async () => {
  const source = new Blob(['large photo'], { type: 'image/png' });
  const thumbnail = new File(['tiny'], 'preview.webp', { type: 'image/webp' });
  vi.mocked(imageCompression).mockResolvedValue(thumbnail);
  expect(await createCatalogPreview(source)).toBe(thumbnail);
  const [file, options] = vi.mocked(imageCompression).mock.lastCall!;
  expect(file.type).toBe(source.type);
  expect(await file.text()).toBe('large photo');
  expect(options).toEqual({ maxSizeMB: 0.045, maxWidthOrHeight: 400, initialQuality: 0.72, fileType: 'image/webp', useWebWorker: false });
});
it.each([
  [0, 'image/webp'], [5, 'image/webp'], [6, 'image/webp'], [2, 'image/png']
])('keeps the source if preview size %i and type %s are unsuitable', async (size, type) => {
  vi.mocked(imageCompression).mockResolvedValue(new File(['x'.repeat(size)], 'preview', { type }));
  expect(await createCatalogPreview(new Blob(['12345'], { type: 'image/jpeg' }))).toBeNull();
});
it('keeps animated GIFs and gracefully handles decoder failures', async () => {
  const count = vi.mocked(imageCompression).mock.calls.length;
  expect(await createCatalogPreview(new Blob(['gif'], { type: 'image/gif' }))).toBeNull();
  expect(vi.mocked(imageCompression).mock.calls.length).toBe(count);
  vi.mocked(imageCompression).mockRejectedValue(new Error('decoder failed'));
  expect(await createCatalogPreview(new Blob(['bad'], { type: 'image/png' }))).toBeNull();
});
