import { getBusinessTerms } from '../../shared/businessTerminology';

export function getOrderStage(status: string | null, delivery: boolean): number {
  if (!status || status === 'canceled' || status === 'cancelled') return -1;
  if (status === 'completed' || status === 'delivered') return delivery ? 4 : 3;
  if (delivery && (status === 'picked_up' || status === 'on_the_way')) return 3;
  if (['ready', 'waiting_driver', 'driver_assigned', 'assigned_driver'].includes(status)) return delivery ? 2 : 3;
  if (status === 'preparing' || status === 'cooking') return 2;
  if (['accepted', 'confirmed', 'payment_confirmed'].includes(status)) return 1;
  return 0;
}

export function getOrderPlaceName(name: string, businessType: unknown): string {
  const label = ['grocery', 'shop', 'store', 'fashion', 'market', 'Магазин'].includes(String(businessType)) ? 'Магазин' : getBusinessTerms(businessType).place;
  return name.toLocaleLowerCase('ru-RU').startsWith(label.toLocaleLowerCase('ru-RU') + ' ') ? name : `${label} ${name}`;
}
