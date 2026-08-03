import { supabase } from '../supabase';
import type { PlatformReview } from './platformTypes';

type ReviewRelation = { name?: string | null } | Array<{ name?: string | null }> | null;

type PlatformReviewRow = {
  id: string;
  target_type: 'restaurant' | 'driver';
  client_name: string;
  rating: number;
  comment: string;
  is_visible: boolean;
  created_at: string;
  catalogs: ReviewRelation;
  drivers: ReviewRelation;
};

const readRelationName = (relation: ReviewRelation) => {
  const value = Array.isArray(relation) ? relation[0] : relation;
  return value?.name?.trim() ?? '';
};

export async function getPlatformReviews(): Promise<PlatformReview[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('client_reviews')
    .select('id, target_type, client_name, rating, comment, is_visible, created_at, catalogs(name), drivers(name)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as PlatformReviewRow[]).map((review) => {
    const targetName = review.target_type === 'driver'
      ? readRelationName(review.drivers) || 'Удалённый водитель'
      : readRelationName(review.catalogs) || 'Удалённый ресторан';

    return {
      id: review.id,
      targetType: review.target_type,
      targetName,
      clientName: review.client_name,
      rating: Number(review.rating),
      comment: review.comment,
      isVisible: review.is_visible,
      createdAt: review.created_at
    };
  });
}

export async function deletePlatformReview(reviewId: string): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('client_reviews')
    .delete()
    .eq('id', reviewId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Отзыв не найден или у вас нет прав на его удаление.');
}
