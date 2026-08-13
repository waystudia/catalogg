import type { RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';

export type RestaurantOrderBoardColumnId = 'new' | 'preparing' | 'ready' | 'delivery' | 'completed' | 'cancelled';

export function getRestaurantOrderBoardColumns(businessType?: string): ReadonlyArray<{
  id: RestaurantOrderBoardColumnId;
  label: string;
}> {
  return [
    { id: 'new', label: 'Новые' },
    {
      id: 'preparing',
      label: businessType === 'grocery' ? 'Собираются' : 'Готовятся'
    },
    { id: 'ready', label: businessType === 'grocery' ? 'Собраны' : 'Готовы' },
    { id: 'delivery', label: 'Доставка' },
    { id: 'completed', label: 'Завершённые' },
    { id: 'cancelled', label: 'Отменённые' }
  ];
}

export function getRestaurantOrderBoardColumnId(status: RestaurantOrderStatus) {
  switch (status) {
    case 'new':
    case 'waiting_payment_confirmation':
    case 'payment_confirmed':
      return 'new';
    case 'accepted':
    case 'confirmed':
    case 'preparing':
    case 'cooking':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'waiting_driver':
    case 'driver_assigned':
    case 'assigned_driver':
    case 'picked_up':
    case 'on_the_way':
      return 'delivery';
    case 'delivered':
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
  }
}
