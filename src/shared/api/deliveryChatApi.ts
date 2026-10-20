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

export type OrderConversationMessage = {
  id: string;
  senderRole: 'client' | 'restaurant' | 'driver';
  body: string;
  createdAt: string;
};

const toOrderConversationMessages = (value: unknown): OrderConversationMessage[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string' && typeof row.body === 'string' &&
        (row.sender_role === 'client' || row.sender_role === 'restaurant' || row.sender_role === 'driver')
        ? [{ id: row.id, body: row.body, senderRole: row.sender_role, createdAt: typeof row.created_at === 'string' ? row.created_at : '' }]
        : [];
    })
  : [];

export async function getClientOrderConversation(sessionToken: string, orderId: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { data, error } = await supabase.rpc('get_client_order_conversation', { client_session_token: sessionToken, target_order_id: orderId });
  if (error) throw new Error('Не удалось открыть чат заказа.');
  return toOrderConversationMessages(data);
}
export async function sendClientOrderConversation(sessionToken: string, orderId: string, body: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { error } = await supabase.rpc('send_client_order_conversation', { client_session_token: sessionToken, target_order_id: orderId, message_body: body.trim() });
  if (error) throw new Error('Не удалось отправить сообщение.');
}
export async function getRestaurantOrderConversation(orderId: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { data, error } = await supabase.rpc('get_restaurant_order_conversation', { target_order_id: orderId });
  if (error) throw new Error('Не удалось открыть чат заказа.');
  return toOrderConversationMessages(data);
}
export async function sendRestaurantOrderConversation(orderId: string, body: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { error } = await supabase.rpc('send_restaurant_order_conversation', { target_order_id: orderId, message_body: body.trim() });
  if (error) throw new Error('Не удалось отправить сообщение.');
}
export async function getDriverOrderConversation(orderId: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { data, error } = await supabase.rpc('get_driver_order_conversation', { target_order_id: orderId });
  if (error) throw new Error('Не удалось открыть чат заказа.');
  return toOrderConversationMessages(data);
}
export async function sendDriverOrderConversation(orderId: string, body: string) {
  if (!supabase) throw new Error('Чат временно недоступен.');
  const { error } = await supabase.rpc('send_driver_order_conversation', { target_order_id: orderId, message_body: body.trim() });
  if (error) throw new Error('Не удалось отправить сообщение.');
}
