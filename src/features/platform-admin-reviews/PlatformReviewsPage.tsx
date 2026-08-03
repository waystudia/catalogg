import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, RefreshCcw, Star, Store, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { deletePlatformReview, getPlatformReviews } from '../../shared/api/platformReviewsApi';
import type { PlatformReview } from '../../shared/api/platformTypes';

type PlatformReviewsPageProps = {
  reviews: PlatformReview[];
  isLoading: boolean;
  isError: boolean;
  deletingReviewId: string | null;
  onReload: () => void;
  onDelete: (review: PlatformReview) => Promise<void>;
};

const targetLabels: Record<PlatformReview['targetType'], string> = {
  restaurant: 'Ресторан',
  driver: 'Водитель'
};

const deleteTargetLabels: Record<PlatformReview['targetType'], string> = {
  restaurant: 'ресторане',
  driver: 'водителе'
};

export function PlatformReviewsPage({
  reviews,
  isLoading,
  isError,
  deletingReviewId,
  onReload,
  onDelete
}: PlatformReviewsPageProps) {
  const [filter, setFilter] = useState<'all' | PlatformReview['targetType']>('all');
  const visibleReviews = filter === 'all'
    ? reviews
    : reviews.filter((review) => review.targetType === filter);

  const requestDelete = async (review: PlatformReview) => {
    const target = `${targetLabels[review.targetType].toLocaleLowerCase('ru-RU')} «${review.targetName}»`;
    if (!window.confirm(`Удалить отзыв о ${target}? Это действие нельзя отменить.`)) return;
    await onDelete(review);
  };

  return (
    <main className="platform-page platform-reviews-page">
      <header className="platform-page-head">
        <div>
          <h1>Отзывы</h1>
          <p>Модерация отзывов о ресторанах и водителях</p>
        </div>
        <button type="button" onClick={onReload} disabled={isLoading}>
          <RefreshCcw />
          Обновить
        </button>
      </header>

      <div className="platform-review-filters" aria-label="Тип отзыва">
        {([
          ['all', 'Все'],
          ['restaurant', 'Рестораны'],
          ['driver', 'Водители']
        ] as const).map(([value, label]) => (
          <button className={filter === value ? 'is-active' : ''} type="button" onClick={() => setFilter(value)} key={value}>
            {label}
          </button>
        ))}
      </div>

      {isLoading && <section className="platform-state">Загружаем отзывы...</section>}
      {isError && (
        <section className="platform-state platform-state--error">
          <p>Не удалось загрузить отзывы.</p>
          <button type="button" onClick={onReload}>Повторить</button>
        </section>
      )}
      {!isLoading && !isError && visibleReviews.length === 0 && (
        <section className="platform-review-empty">
          <MessageCircle />
          <h2>Отзывов пока нет</h2>
          <p>Здесь появятся отзывы клиентов о ресторанах и водителях.</p>
        </section>
      )}
      {!isLoading && !isError && visibleReviews.length > 0 && (
        <section className="platform-review-list" aria-label="Отзывы платформы">
          {visibleReviews.map((review) => {
            const TargetIcon = review.targetType === 'driver' ? Truck : Store;
            const deleting = deletingReviewId === review.id;
            return (
              <article className="platform-review-card" key={review.id}>
                <header>
                  <span><TargetIcon />{targetLabels[review.targetType]} · {review.targetName}</span>
                  <strong><Star />{review.rating.toFixed(1)}</strong>
                </header>
                <p>{review.comment || 'Без комментария'}</p>
                <footer>
                  <span>
                    <b>{review.clientName || 'Клиент WayYaam'}</b>
                    <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</time>
                  </span>
                  <button
                    className="is-danger"
                    type="button"
                    disabled={deleting}
                    onClick={() => void requestDelete(review)}
                    aria-label={`Удалить отзыв о ${deleteTargetLabels[review.targetType]} ${review.targetName}`}
                  >
                    <Trash2 />
                    {deleting ? 'Удаляем...' : 'Удалить'}
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export function PlatformReviewsRoute() {
  const queryClient = useQueryClient();
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const reviewsQuery = useQuery({
    queryKey: ['platform-reviews'],
    queryFn: getPlatformReviews,
    staleTime: 0
  });

  const removeReview = async (review: PlatformReview) => {
    setDeletingReviewId(review.id);
    try {
      await deletePlatformReview(review.id);
      toast.success('Отзыв удалён');
      await queryClient.invalidateQueries({ queryKey: ['platform-reviews'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить отзыв');
    } finally {
      setDeletingReviewId(null);
    }
  };

  return (
    <PlatformReviewsPage
      reviews={reviewsQuery.data ?? []}
      isLoading={reviewsQuery.isLoading}
      isError={reviewsQuery.isError}
      deletingReviewId={deletingReviewId}
      onReload={() => void reviewsQuery.refetch()}
      onDelete={removeReview}
    />
  );
}
