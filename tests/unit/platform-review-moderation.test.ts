import { describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), enabled: true }));

vi.mock('../../src/shared/supabase', () => ({
  get supabase() {
    return supabaseMock.enabled ? { from: supabaseMock.from } : null;
  }
}));

import { deletePlatformReview, getPlatformReviews } from '../../src/shared/api/platformReviewsApi';

describe('platform review moderation', () => {
  it('returns restaurant and driver reviews with their real target names', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'review-restaurant',
          target_type: 'restaurant',
          client_name: 'Адам',
          rating: 5,
          comment: 'Отлично',
          is_visible: true,
          created_at: '2026-08-03T10:00:00.000Z',
          catalogs: { name: '  Мангал  ' },
          drivers: null
        },
        {
          id: 'review-driver',
          target_type: 'driver',
          client_name: 'Марьям',
          rating: 2,
          comment: 'Опоздал',
          is_visible: false,
          created_at: '2026-08-03T11:00:00.000Z',
          catalogs: null,
          drivers: [{ name: 'Магомед' }]
        }
      ],
      error: null
    });
    const select = vi.fn().mockReturnValue({ order });
    supabaseMock.from.mockReturnValue({ select });

    await expect(getPlatformReviews()).resolves.toEqual([
      {
        id: 'review-restaurant',
        targetType: 'restaurant',
        targetName: 'Мангал',
        clientName: 'Адам',
        rating: 5,
        comment: 'Отлично',
        isVisible: true,
        createdAt: '2026-08-03T10:00:00.000Z'
      },
      {
        id: 'review-driver',
        targetType: 'driver',
        targetName: 'Магомед',
        clientName: 'Марьям',
        rating: 2,
        comment: 'Опоздал',
        isVisible: false,
        createdAt: '2026-08-03T11:00:00.000Z'
      }
    ]);
    expect(supabaseMock.from).toHaveBeenCalledWith('client_reviews');
    expect(select).toHaveBeenCalledWith('id, target_type, client_name, rating, comment, is_visible, created_at, catalogs(name), drivers(name)');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('uses explicit fallback names when a deleted target relation is missing', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'missing-restaurant', target_type: 'restaurant', client_name: '', rating: 4,
          comment: '', is_visible: true, created_at: '2026-08-03T10:00:00.000Z', catalogs: {}, drivers: null
        },
        {
          id: 'missing-driver', target_type: 'driver', client_name: '', rating: 3,
          comment: '', is_visible: true, created_at: '2026-08-03T11:00:00.000Z', catalogs: null, drivers: []
        }
      ],
      error: null
    });
    supabaseMock.from.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });

    const result = await getPlatformReviews();

    expect(result.map((review) => review.targetName)).toEqual(['Удалённый ресторан', 'Удалённый водитель']);
  });

  it('deletes exactly the requested review and verifies that a row was removed', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'review-driver' }, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ select });
    const remove = vi.fn().mockReturnValue({ eq });
    supabaseMock.from.mockReturnValue({ delete: remove });

    await expect(deletePlatformReview('review-driver')).resolves.toBeUndefined();
    expect(supabaseMock.from).toHaveBeenCalledWith('client_reviews');
    expect(eq).toHaveBeenCalledWith('id', 'review-driver');
    expect(select).toHaveBeenCalledWith('id');
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it('rejects a delete hidden by RLS or targeting a missing review', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseMock.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ maybeSingle })
        })
      })
    });

    await expect(deletePlatformReview('missing-review')).rejects.toThrow('Отзыв не найден или у вас нет прав');
  });

  it('surfaces database errors without reporting a successful deletion', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const databaseError = new Error('database unavailable');
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    supabaseMock.from.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ maybeSingle })
        })
      })
    });

    await expect(deletePlatformReview('review-restaurant')).rejects.toBe(databaseError);
  });

  it('surfaces database errors while loading reviews', async () => {
    supabaseMock.enabled = true;
    supabaseMock.from.mockReset();
    const databaseError = new Error('review query unavailable');
    const order = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    supabaseMock.from.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });

    await expect(getPlatformReviews()).rejects.toBe(databaseError);
  });

  it('returns safe local fallbacks when Supabase is not configured', async () => {
    supabaseMock.enabled = false;

    await expect(getPlatformReviews()).resolves.toEqual([]);
    await expect(deletePlatformReview('review-restaurant')).resolves.toBeUndefined();

    supabaseMock.enabled = true;
  });
});
