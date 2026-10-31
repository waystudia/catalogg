import { ReceiptText } from 'lucide-react';
import type { ClientOrder, ClientPlatformSnapshot } from '../../features/client-platform/types';
import { SafeImage } from '../../shared/SafeImage';
import { formatPublicOrderNumber } from '../../shared/publicOrderNumber';

export function HomeActiveOrderCard({ order, snapshot, status, multiple = false, previewOnly = false }: { order: ClientOrder; snapshot?: ClientPlatformSnapshot; status: string; multiple?: boolean; previewOnly?: boolean }) {
  const images = order.items.map((item) => item.imageUrl || snapshot?.dishes.find((dish) =>
    dish.id === item.dishId || (dish.restaurantSlug === order.restaurantSlug && dish.name.trim().toLocaleLowerCase('ru-RU') === item.name.trim().toLocaleLowerCase('ru-RU'))
  )?.imageUrl).filter((src): src is string => Boolean(src));
  const previews = [...new Set(images)].slice(0, 3);
  const cover = snapshot?.restaurants.find((restaurant) => restaurant.slug === order.restaurantSlug)?.coverUrl;
  return <>
    {!previewOnly && <span className="home-active-order__details">
      <small>{multiple ? 'Текущие заказы' : 'Текущий заказ'}</small>
      <strong>{order.restaurantName}</strong>
      <span>№{formatPublicOrderNumber(order.id, order.restaurantName)} · {new Intl.NumberFormat('ru-RU').format(order.totalAmount)} ₽</span>
      <em>{status}</em>
    </span>}
    <span className="home-active-order__preview" aria-hidden="true">
      {previews.length ? <span className={`home-active-order__dish-fan${previews.length > 1 ? ' is-stacked' : ''}`}>
        {previews.map((src) => <SafeImage preview className="home-active-order__dish-image" key={src} src={src} alt="" width={160} height={160} />)}
      </span> : cover ? <SafeImage preview src={cover} alt="" width={160} height={160} /> : <ReceiptText />}
    </span>
  </>;
}
