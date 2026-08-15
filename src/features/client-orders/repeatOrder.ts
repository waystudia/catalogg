import type { ClientOrder, ClientPlatformSnapshot } from '../client-platform/types';

export const prepareClientRepeatOrder = (snapshot: ClientPlatformSnapshot, order: ClientOrder) => {
  const restaurant = snapshot.restaurants.find((item) => item.slug === order.restaurantSlug);
  if (!restaurant) {
    return { order: null, unavailableNames: order.items.map((item) => item.name), changedPriceNames: [], reason: 'Заведение сейчас недоступно.' };
  }

  const unavailableNames: string[] = [];
  const changedPriceNames: string[] = [];
  const availableItems = order.items.flatMap((item) => {
    const dish = snapshot.dishes.find((candidate) => candidate.id === item.dishId && candidate.restaurantSlug === order.restaurantSlug);
    const hasStock = Boolean(dish?.isUnlimited) || Number(dish?.stockCount ?? dish?.stockQuantity ?? 0) > 0;
    if (!dish || dish.isAvailable === false || !hasStock) {
      unavailableNames.push(item.name);
      return [];
    }
    if (dish.price !== item.price) changedPriceNames.push(item.name);
    return [{ ...item, name: dish.name, price: dish.price }];
  });

  if (availableItems.length === 0) {
    return { order: null, unavailableNames, changedPriceNames, reason: 'Товары из этого заказа сейчас недоступны.' };
  }

  const changes = [
    unavailableNames.length > 0 ? `Не добавлены: ${unavailableNames.join(', ')}.` : '',
    changedPriceNames.length > 0 ? `Цена обновилась: ${changedPriceNames.join(', ')}.` : ''
  ].filter(Boolean).join(' ');

  return {
    order: { ...order, items: availableItems },
    unavailableNames,
    changedPriceNames,
    reason: changes || 'Все товары доступны по прежним ценам.'
  };
};
