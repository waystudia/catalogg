import type { OrderConversationViewer } from '../../shared/api/orderConversationApi';

type QuickReplyInput = {
  viewer: OrderConversationViewer;
  orderStatus?: string;
  estimatedMinutes?: number | null;
};

const normalizedStatus = (value?: string) => value?.trim().toLocaleLowerCase('ru-RU') ?? '';

const normalizedMinutes = (value?: number | null) => {
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) ? Math.min(180, Math.max(1, minutes)) : 15;
};

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean))).slice(0, 3);

export const getOrderConversationQuickReplies = ({
  viewer,
  orderStatus,
  estimatedMinutes
}: QuickReplyInput): string[] => {
  const status = normalizedStatus(orderStatus);
  const minutes = normalizedMinutes(estimatedMinutes);

  if (viewer === 'driver') {
    if (status === 'assigned') {
      return [
        'Я принял заказ и еду в заведение.',
        `Буду в заведении примерно через ${minutes} минут.`,
        'Напишу, когда заберу заказ.'
      ];
    }
    if (status === 'arrived_to_restaurant') {
      return [
        'Я приехал в заведение и ожидаю заказ.',
        'Заказ ещё не выдали. Сообщу, когда поеду к вам.',
        'Не могу дозвониться. Напишите, пожалуйста, как с вами связаться.'
      ];
    }
    if (status === 'handed_over' || status === 'picked_up' || status === 'on_the_way') {
      return [
        `Забрал заказ. Буду у вас примерно через ${minutes} минут.`,
        'Позвоню, когда буду на месте.',
        'Не могу дозвониться. Напишите, пожалуйста, как с вами связаться.'
      ];
    }
    if (status === 'arrived_to_client') {
      return [
        'Я на месте.',
        'Не могу дозвониться. Напишите, пожалуйста, как с вами связаться.',
        'Подскажите, пожалуйста, подъезд и домофон.'
      ];
    }
    return [
      'Я на связи по вашему заказу.',
      `Ориентировочное время в пути — ${minutes} минут.`,
      'Не могу дозвониться. Напишите, пожалуйста, как с вами связаться.'
    ];
  }

  if (viewer === 'staff') {
    if (['new', 'waiting_payment_confirmation', 'payment_confirmed'].includes(status)) {
      return unique([
        'Заказ принят. Начинаем работу.',
        `Заказ будет готов примерно через ${minutes} минут.`,
        'Свяжемся с вами, если потребуется уточнение.'
      ]);
    }
    if (['accepted', 'confirmed', 'preparing', 'cooking'].includes(status)) {
      return unique([
        `Заказ будет готов примерно через ${minutes} минут.`,
        'Заказ будет готов через 15 минут.',
        'Нам понадобится ещё около 10 минут.'
      ]);
    }
    if (status === 'ready') {
      return [
        'Заказ готов.',
        'Заказ готов и ожидает курьера.',
        'Можно забирать заказ.'
      ];
    }
    if (['waiting_driver', 'driver_assigned', 'assigned_driver'].includes(status)) {
      return [
        'Ищем курьера. Сообщим, когда он будет назначен.',
        'Курьер уже назначен.',
        'Заказ готов и ожидает курьера.'
      ];
    }
    return [
      'Мы на связи по вашему заказу.',
      `Ориентировочное время ожидания — ${minutes} минут.`,
      'Свяжемся с вами, если что-то изменится.'
    ];
  }

  if (status === 'arrived_to_client') {
    return [
      'Я сейчас выйду.',
      'Позвоните, пожалуйста, когда будете на месте.',
      'Уточню адрес в следующем сообщении.'
    ];
  }
  if (['assigned', 'driver_assigned', 'assigned_driver', 'picked_up', 'handed_over', 'on_the_way'].includes(status)) {
    return [
      'Позвоните, пожалуйста, когда будете на месте.',
      'Я сейчас уточню адрес.',
      'Спасибо, буду ждать.'
    ];
  }
  return [
    'Спасибо, буду ждать.',
    'Сообщите, пожалуйста, если время изменится.',
    'Уточню детали в следующем сообщении.'
  ];
};
