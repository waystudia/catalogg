import { getStoredClientSessionToken } from './clientAccountApi';
import { supabase } from '../supabase';
import {
  emptyClientNotificationSnapshot,
  mapClientNotificationSnapshot,
  type ClientNotificationSnapshot
} from './clientNotificationsModels';

export type { ClientNotification, ClientNotificationSnapshot } from './clientNotificationsModels';
export { mapClientNotificationSnapshot } from './clientNotificationsModels';

export async function getClientNotifications(limit = 30): Promise<ClientNotificationSnapshot> {
  const clientSessionToken = getStoredClientSessionToken();
  if (!supabase || !clientSessionToken) return emptyClientNotificationSnapshot;
  const { data, error } = await supabase.rpc('get_client_notifications', {
    client_session_token: clientSessionToken,
    result_limit: limit
  });
  if (error) throw error;
  return mapClientNotificationSnapshot(data);
}

export async function markClientNotificationRead(notificationId: string) {
  const clientSessionToken = getStoredClientSessionToken();
  if (!supabase || !clientSessionToken || !notificationId) return false;
  const { data, error } = await supabase.rpc('mark_client_notification_read', {
    target_notification_id: notificationId,
    client_session_token: clientSessionToken
  });
  if (error) throw error;
  return data === true;
}
