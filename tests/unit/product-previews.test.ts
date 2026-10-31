import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistCatalogMedia } from '../../src/shared/catalogMedia';
import { productPreviewUrl } from '../../src/shared/productPreviewUrl';
vi.mock('../../src/shared/catalogPreview', () => ({ createCatalogPreview: vi.fn() }));
import { createCatalogPreview } from '../../src/shared/catalogPreview';

const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const base = 'https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/c1/media/';
const photo = 'data:image/png;base64,aGVsbG8=';
const setup = (failAt = 0) => {
  const upload = vi.fn(async () => ({ error: failAt && upload.mock.calls.length === failAt ? new Error('upload failed') : null }));
  const client = { storage: { from: () => ({ upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://api.wayyaam.ru/storage/v1/object/public/catalog-assets/${path}` } }) }) } } as unknown as SupabaseClient;
  return { client, upload };
};
describe('product preview delivery', () => {
  it('saves both sizes once and advertises preview only after both uploads succeed', async () => {
    vi.mocked(createCatalogPreview).mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
    const { client, upload } = setup();
    const result = await persistCatalogMedia(client, 'c1', { image_url: photo, image_urls: [photo] }, { productPreviews: true });
    expect(result.image_url).toBe(`${base}${hash}.full-v1.png`);
    expect(result.image_urls).toEqual([result.image_url]);
    expect(upload.mock.calls).toHaveLength(2);
    expect(upload.mock.calls[0]).toEqual([`c1/media/${hash}.thumb-v1.webp`, expect.any(Blob), { contentType: 'image/webp', cacheControl: '31536000', upsert: true }]);
    expect(upload.mock.calls[1]).toEqual([`c1/media/${hash}.full-v1.png`, expect.any(Blob), { contentType: 'image/png', cacheControl: '31536000', upsert: true }]);
    expect(productPreviewUrl(result.image_url)).toBe(`${base}${hash}.thumb-v1.webp`);
  });
  it.each([1, 2])('does not return a saved reference when upload %i fails', async (at) => {
    vi.mocked(createCatalogPreview).mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
    const { client, upload } = setup(at);
    await expect(persistCatalogMedia(client, 'c1', photo, { productPreviews: true })).rejects.toThrow('upload failed');
    expect(upload.mock.calls).toHaveLength(at);
  });
  it('keeps a regular full-size URL when a preview cannot be made', async () => {
    vi.mocked(createCatalogPreview).mockResolvedValue(null);
    const { client, upload } = setup();
    expect(await persistCatalogMedia(client, 'c1', photo, { productPreviews: true })).toBe(`${base}${hash}.png`);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('never requests invented previews for old files, external links, QR codes or drafts', () => {
    for (const url of ['', photo, '/photo.png', `${base}${hash}.png`, `https://external.test/${hash}.full-v1.jpg`, `${base}qr.png`]) expect(productPreviewUrl(url)).toBe(url);
  });
  it.each(['jpg', 'png', 'webp', 'avif'])('maps only versioned storage %s files, retaining query params', (ext) => {
    expect(productPreviewUrl(`${base}${hash}.full-v1.${ext}?x=1`)).toBe(`${base}${hash}.thumb-v1.webp?x=1`);
  });
});
