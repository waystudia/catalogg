import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistCatalogMedia } from '../../src/shared/catalogMedia';

const photo = 'data:image/png;base64,aGVsbG8=';
const setup = (error: Error | null = null) => {
  const upload = vi.fn<(path: string, body: Blob, options: unknown) => Promise<{ error: Error | null }>>(async () => ({ error }));
  const from = vi.fn(() => ({
    upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.test/${path}` } })
  }));
  const client = { storage: { from } } as unknown as SupabaseClient;
  return { client, upload, from };
};

describe('catalog media persistence', () => {
  it('uploads drafts once and replaces nested photo values without changing the draft', async () => {
    const { client, upload, from } = setup();
    const draft = { image: photo, gallery: [photo, '/existing.webp'], title: 'Блюдо', count: 0, extra: null };
    const saved = await persistCatalogMedia(client, 'catalog-1', draft);
    expect(saved.image).toMatch(/^https:\/\/media.test\/catalog-1\/media\/[a-f0-9]{64}\.png$/);
    expect(saved).toEqual({ ...draft, image: saved.image, gallery: [saved.image, '/existing.webp'] });
    expect(draft.image).toBe(photo);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toContain('catalog-1/media/');
    expect(from).toHaveBeenCalledWith('catalog-assets');
    expect(upload.mock.calls[0]?.[1]).toBeInstanceOf(Blob);
    expect(upload.mock.calls[0]?.[2]).toEqual({ contentType: 'image/png', cacheControl: '31536000', upsert: true });
  });

  it('keeps remote and local URLs without uploading', async () => {
    const { client, upload } = setup();
    const values = ['', 'https://example.test/photo.jpg', '/image.webp'];
    expect(await persistCatalogMedia(client, 'catalog-1', values)).toEqual(values);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects upload failure instead of returning a broken image reference', async () => {
    const { client } = setup(new Error('Нет доступа'));
    await expect(persistCatalogMedia(client, 'catalog-1', photo)).rejects.toThrow('Нет доступа');
  });

  it('rejects active SVG and empty image bodies before upload', async () => {
    const { client, upload } = setup();
    await expect(persistCatalogMedia(client, 'catalog-1', 'data:image/svg+xml,<svg/>')).rejects.toThrow('Фото');
    await expect(persistCatalogMedia(client, 'catalog-1', 'data:image/png;base64,')).rejects.toThrow('Фото');
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([['jpeg', 'jpg'], ['webp', 'webp'], ['gif', 'gif'], ['avif', 'avif']])('preserves %s content type and extension', async (mime, extension) => {
    const { client, upload } = setup();
    expect(await persistCatalogMedia(client, 'catalog-2', `data:image/${mime};base64,aGVsbG8=`))
      .toBe(`https://media.test/catalog-2/media/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824.${extension}`);
    expect(upload.mock.calls[0]?.[2]).toMatchObject({ contentType: `image/${mime}` });
  });

  it('accepts exactly 6 MiB and rejects larger images', async () => {
    const { client, upload } = setup();
    const image = (size: number) => `data:image/png;base64,${Buffer.alloc(size).toString('base64')}`;
    await expect(persistCatalogMedia(client, 'catalog-1', image(6 * 1024 * 1024))).resolves.toMatch(/\.png$/);
    await expect(persistCatalogMedia(client, 'catalog-1', image(6 * 1024 * 1024 + 1))).rejects.toThrow('Фото');
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
