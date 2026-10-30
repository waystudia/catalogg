import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Repeat2, Star, Store } from 'lucide-react';
import { useClientPlatformStore } from '../client-platform/store';
import type { ClientOrder } from '../client-platform/types';
import { useCartStore, useOrderStore } from '../stores';
import type { Product } from '../../entities/models';
import { saveClientReview } from '../../shared/api/clientPlatformApi';
import { buildYandexMapsUrl } from '../client-platform/clientPlatformLogic';

export function OrderDetailActions({ order, restaurantId, catalogSlug, products, address, lat, lng }: {
  order?: ClientOrder; restaurantId: string; catalogSlug: string; products: Array<Pick<Product, 'id' | 'title' | 'image_url'> & Partial<Product>>;
  address?: string; lat?: number | null; lng?: number | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const profile = useClientPlatformStore(state => state.profile);
  const map = address || (Number.isFinite(lat) && Number.isFinite(lng)) ? buildYandexMapsUrl({ addressLine: address || '', lat: lat ?? Number.NaN, lng: lng ?? Number.NaN }) : '';
  const repeat = () => {
    if (!order) return;
    useClientPlatformStore.getState().repeatOrder(order);
    const items = order.items.map(item => {
      const current = products.find(product => product.id === item.dishId);
      const product: Product = {
        id: item.dishId, title: item.name, price: item.price, image_url: item.imageUrl || '', description: '', ingredients: '', weight: '', spicy_level: 0,
        serving: '', is_popular: false, is_new: false, is_hit: false, is_hidden: false, is_unlimited: true, stock_count: 999, category_id: '', pair_ids: [], ...current
      };
      return { product, quantity: item.quantity };
    });
    useCartStore.setState({ items, updatedAt: items.length ? Date.now() : null });
    useOrderStore.getState().setOrder({ mode: order.orderType === 'delivery' ? 'delivery' : order.orderType === 'pickup' ? 'takeaway' : 'hall', clientName: order.clientName, clientPhone: order.clientPhone, deliveryAddress: order.orderType === 'delivery' ? order.addressLine : '', deliveryLat: order.deliveryLat ?? null, deliveryLng: order.deliveryLng ?? null });
    navigate(`/${order.restaurantSlug}/checkout`);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!order || sending) return;
    setSending(true); setError(''); setMessage('');
    try {
      await saveClientReview({ orderId: order.id, restaurantId, clientName: profile.name || order.clientName, clientPhone: profile.phone || order.clientPhone, rating, comment });
      await queryClient.invalidateQueries({ queryKey: ['client-platform'] });
      setMessage('Спасибо! Отзыв отправлен.'); setComment(''); setReviewOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отправить отзыв. Попробуйте ещё раз.'); }
    finally { setSending(false); }
  };
  return <section className="live-order__actions" aria-label="Действия с заказом">
    <div className="live-order__action-grid">
      <Link to={`/${catalogSlug}`}><Store />Открыть заведение</Link>
      {map && <a href={map} target="_blank" rel="noreferrer"><MapPin />На карте</a>}
      {order && <><button type="button" onClick={repeat}><Repeat2 />Повторить заказ</button><button type="button" aria-expanded={reviewOpen} onClick={() => { setReviewOpen(!reviewOpen); setError(''); }}><Star />Оставить отзыв</button></>}
    </div>
    {reviewOpen && <form className="live-order__review" onSubmit={event => void submit(event)}>
      <label>Оценка<select value={rating} onChange={event => setRating(Number(event.target.value))}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} из 5</option>)}</select></label>
      <label>Ваш отзыв<textarea rows={3} value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} /></label>
      <button type="submit" disabled={sending}>{sending ? 'Отправляем…' : 'Отправить отзыв'}</button>
    </form>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
