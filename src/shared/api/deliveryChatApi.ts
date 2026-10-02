import { supabase } from '../supabase';

export type DeliveryChatMessage = {
  id: string;
  senderRole: 'driver' | 'client';
  body: string;
  createdAt: string;
};

const toMessages = (value: unknown): DeliveryChatMessage[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string' && typeof row.body === 'string' &&
        (row.sender_role === 'driver' || row.sender_role === 'client')
        ? [{ id: row.id, body: row.body, senderRole: row.sender_role, createdAt: typeof row.created_at === 'string' ? row.created_at : '' }]
        : [];
    })
  : [];

export async function getDriverDeliveryChat(deliveryId: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { data, error } = await supabase.rpc('get_driver_delivery_chat', { target_delivery_id: deliveryId });
  if (error) throw new Error('Не удалось открыть чат заказа.');
  return toMessages(data);
}

export async function sendDriverDeliveryChat(deliveryId: string, body: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { error } = await supabase.rpc('send_driver_delivery_chat', { target_delivery_id: deliveryId, message_body: body.trim() });
  if (error) throw new Error('Не удалось отправить сообщение.');
}

export async function getClientDeliveryChat(sessionToken: string, orderId: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { data, error } = await supabase.rpc('get_client_delivery_chat', { client_session_token: sessionToken, target_order_id: orderId });
  if (error) throw new Error('Не удалось открыть чат заказа.');
  return toMessages(data);
}

export async function sendClientDeliveryChat(sessionToken: string, orderId: string, body: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { error } = await supabase.rpc('send_client_delivery_chat', { client_session_token: sessionToken, target_order_id: orderId, message_body: body.trim() });
  if (error) throw new Error('Не удалось отправить сообщение.');
}
