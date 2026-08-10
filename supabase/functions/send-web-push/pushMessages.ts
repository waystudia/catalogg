const russianPushStatuses: Record<string, string> = {
  new: 'Новый заказ',
  accepted: 'Принят рестораном',
  confirmed: 'Принят рестораном',
  payment_confirmed: 'Оплата подтверждена',
  preparing: 'Готовится',
  cooking: 'Готовится',
  ready: 'Готов к выдаче',
  waiting_driver: 'Ожидает курьера',
  waiting_courier: 'Ожидает курьера',
  assigned: 'Курьер назначен',
  assigned_driver: 'Курьер назначен',
  driver_assigned: 'Курьер назначен',
  arrived_to_restaurant: 'Курьер прибыл в ресторан',
  handed_over: 'Заказ передан курьеру',
  picked_up: 'Заказ передан курьеру',
  on_the_way: 'Курьер в пути',
  arrived_to_client: 'Курьер прибыл к клиенту',
  delivered: 'Доставлен',
  completed: 'Выполнен',
  cancelled: 'Отменён',
  canceled: 'Отменён'
};

export const getRussianPushStatus = (status: unknown) =>
  russianPushStatuses[status as string] || 'Статус обновлён';
