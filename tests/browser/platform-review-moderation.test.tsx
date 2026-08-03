import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { PlatformReviewsPage } from '../../src/features/platform-admin-reviews/PlatformReviewsPage';

const reviews = [
  {
    id: 'review-restaurant',
    targetType: 'restaurant' as const,
    targetName: 'Мангал',
    clientName: 'Адам',
    rating: 5,
    comment: 'Отличный ресторан',
    isVisible: true,
    createdAt: '2026-08-03T10:00:00.000Z'
  },
  {
    id: 'review-driver',
    targetType: 'driver' as const,
    targetName: 'Магомед',
    clientName: 'Марьям',
    rating: 2,
    comment: 'Опоздал с доставкой',
    isVisible: true,
    createdAt: '2026-08-03T11:00:00.000Z'
  }
];

test('super admin can review and delete restaurant and driver feedback', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    const screen = await render(
      <PlatformReviewsPage
        reviews={reviews}
        isLoading={false}
        isError={false}
        deletingReviewId={null}
        onReload={vi.fn()}
        onDelete={onDelete}
      />
    );

    await expect.element(screen.getByText('Ресторан · Мангал')).toBeVisible();
    await expect.element(screen.getByText('Водитель · Магомед')).toBeVisible();
    await screen.getByRole('button', { name: 'Удалить отзыв о водителе Магомед' }).click();

    expect(confirm).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(reviews[1]);
  } finally {
    confirm.mockRestore();
  }
});

test('cancelling confirmation keeps the review', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    const screen = await render(
      <PlatformReviewsPage
        reviews={[reviews[0]]}
        isLoading={false}
        isError={false}
        deletingReviewId={null}
        onReload={vi.fn()}
        onDelete={onDelete}
      />
    );

    await screen.getByRole('button', { name: 'Удалить отзыв о ресторане Мангал' }).click();

    expect(onDelete).not.toHaveBeenCalled();
  } finally {
    confirm.mockRestore();
  }
});
