import type { CartItem } from '../entities/models';
import { getSelectedModifierDetails } from '../entities/productModifiers';
import { getCartItemTotal, normalizeSelectedWeight, formatRublePrice } from '../entities/productPricing';

const formatOrderDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(parsed);
};

export type WhatsappOrderInput = {
  businessName: string;
  businessLabel: string;
  items: CartItem[];
  fulfillmentLabel: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  comment?: string;
  paymentLabel?: string;
  total: number;
};

export const buildWhatsappOrderText = ({
  businessName,
  businessLabel,
  items,
  fulfillmentLabel,
  customerName = '',
  customerPhone = '',
  deliveryAddress = '',
  comment = '',
  paymentLabel = '',
  total
}: WhatsappOrderInput) => {
  const lines = [
    'Новый заказ из WayYaam',
    `${businessLabel}: ${businessName}`
  ];

  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.product.title}`);
    if (item.selected_choice?.trim()) lines.push(`Вариант: ${item.selected_choice.trim()}`);
    if (item.selected_weight !== undefined) {
      lines.push(`Вес: ${normalizeSelectedWeight(item.product, item.selected_weight).toLocaleString('ru-RU')} кг`);
    }
    getSelectedModifierDetails(item).forEach(({ group, option }) => lines.push(`${group.name}: ${option.name}`));
    if (item.inscription?.trim()) lines.push(`Надпись: «${item.inscription.trim().slice(0, 80)}»`);
    if (item.decoration_comment?.trim()) lines.push(`Комментарий к оформлению: ${item.decoration_comment.trim().slice(0, 300)}`);
    if (item.production_date?.trim()) lines.push(`Дата: ${formatOrderDate(item.production_date.trim())}`);
    if (item.production_time?.trim()) lines.push(`Время: ${item.production_time.trim()}`);
    if (item.quantity > 1) lines.push(`Количество: ${item.quantity}`);
    lines.push(`Цена: ${formatRublePrice(getCartItemTotal(item))}`);
  });

  lines.push(`Получение: ${fulfillmentLabel}`);
  if (deliveryAddress.trim()) lines.push(`Адрес: ${deliveryAddress.trim()}`);
  if (customerName.trim()) lines.push(`Имя клиента: ${customerName.trim()}`);
  if (customerPhone.trim()) lines.push(`Телефон: ${customerPhone.trim()}`);
  if (paymentLabel.trim()) lines.push(`Оплата: ${paymentLabel.trim()}`);
  if (comment.trim()) lines.push(`Комментарий: ${comment.trim().slice(0, 500)}`);
  lines.push(`Итого: ${formatRublePrice(total)}`);

  return lines.join('\n');
};
