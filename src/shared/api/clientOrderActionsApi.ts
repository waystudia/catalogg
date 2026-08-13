import { supabase } from '../supabase';
import { getStoredClientSessionToken } from './clientAccountApi';

const cancellationError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('catalog_order_cancellation_too_late')) {
    return 'Заказ уже передан в сборку или доставку. Напишите магазину в чат.';
  }
  if (normalized.includes('catalog_order_cancellation_picking_started')) {
    return 'Сборка уже началась. Согласуйте отмену с магазином в чате.';
  }
  if (normalized.includes('catalog_order_client_required')) {
    return 'Сессия клиента закончилась. Войдите снова и повторите отмену.';
  }
  return message;
};

export async function cancelClientCatalogOrder({
  orderId,
  catalogId,
  reason
}: {
  orderId: string;
  catalogId: string;
  reason?: string;
}) {
  if (!supabase) return { cancelled: true, status: 'canceled' as const };
  const { data, error } = await supabase.rpc('cancel_client_catalog_order', {
    target_order_id: orderId,
    target_catalog_id: catalogId,
    client_session_token: getStoredClientSessionToken(),
    cancellation_reason: reason?.trim() || 'Планы изменились'
  });
  if (error) throw new Error(cancellationError(error.message));
  const result = (data ?? {}) as { cancelled?: boolean; status?: string };
  if (result.cancelled !== true) throw new Error('Не удалось отменить заказ');
  return { cancelled: true, status: 'canceled' as const };
}
