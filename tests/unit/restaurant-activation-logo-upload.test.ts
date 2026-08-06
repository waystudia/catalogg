import { describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  enabled: true,
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn()
}));

vi.mock('../../src/shared/supabase', () => ({
  get supabase() {
    return supabaseMock.enabled
      ? { storage: { from: supabaseMock.from } }
      : null;
  }
}));

import { restaurantActivationAdminApi } from '../../src/features/platform-admin-activations/restaurantActivationAdminApi';

const resetStorage = () => {
  supabaseMock.enabled = true;
  supabaseMock.from.mockReset();
  supabaseMock.upload.mockReset();
  supabaseMock.getPublicUrl.mockReset();
  supabaseMock.from.mockReturnValue({
    upload: supabaseMock.upload,
    getPublicUrl: supabaseMock.getPublicUrl
  });
};

describe('restaurant activation logo upload', () => {
  it('uploads an image to a unique restaurant activation path and returns its public URL', async () => {
    resetStorage();
    supabaseMock.upload.mockResolvedValue({ error: null });
    supabaseMock.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.wayyaam.ru/platform-banner-media/restaurant-activation-logos/client-1/logo.webp' }
    });
    const file = new File([new Uint8Array(128)], 'Мангал.W@E!B#P', { type: 'image/webp' });

    await expect(restaurantActivationAdminApi.uploadLogo('client-1', file)).resolves.toBe(
      'https://cdn.wayyaam.ru/platform-banner-media/restaurant-activation-logos/client-1/logo.webp'
    );
    expect(supabaseMock.from).toHaveBeenCalledWith('platform-banner-media');
    expect(supabaseMock.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^restaurant-activation-logos\/client-1\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.webp$/),
      file,
      { cacheControl: '31536000', contentType: 'image/webp', upsert: false }
    );
  });

  it('rejects non-image media before contacting Storage', async () => {
    resetStorage();
    const file = new File(['video'], 'promo.mp4', { type: 'video/mp4' });

    await expect(restaurantActivationAdminApi.uploadLogo('client-1', file)).rejects.toThrow(
      'Выберите изображение'
    );
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('rejects images larger than 6 MB before contacting Storage', async () => {
    resetStorage();
    const file = new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });

    await expect(restaurantActivationAdminApi.uploadLogo('client-1', file)).rejects.toThrow(
      'Размер логотипа не должен превышать 6 МБ'
    );
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('accepts an image exactly at the 6 MB boundary', async () => {
    resetStorage();
    supabaseMock.upload.mockResolvedValue({ error: null });
    supabaseMock.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.wayyaam.ru/exact-limit.png' } });
    const file = new File([new Uint8Array(6 * 1024 * 1024)], 'limit.png', { type: 'image/png' });

    await expect(restaurantActivationAdminApi.uploadLogo('client-1', file)).resolves.toBe(
      'https://cdn.wayyaam.ru/exact-limit.png'
    );
  });

  it('sanitizes the restaurant folder and falls back to safe path names', async () => {
    resetStorage();
    supabaseMock.upload.mockResolvedValue({ error: null });
    supabaseMock.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.wayyaam.ru/fallback.jpg' } });
    const file = new File(['logo'], '', { type: 'image/jpeg' });

    await restaurantActivationAdminApi.uploadLogo('../', file);

    expect(supabaseMock.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^restaurant-activation-logos\/restaurant\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.jpg$/),
      file,
      expect.any(Object)
    );
  });

  it('does not report a URL when Storage rejects the upload', async () => {
    resetStorage();
    supabaseMock.upload.mockResolvedValue({ error: new Error('storage unavailable') });
    const file = new File(['logo'], 'mangal.png', { type: 'image/png' });

    await expect(restaurantActivationAdminApi.uploadLogo('client-1', file)).rejects.toThrow('storage unavailable');
    expect(supabaseMock.getPublicUrl).not.toHaveBeenCalled();
  });
});
