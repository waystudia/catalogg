import { getStoredClientSessionToken } from './clientAccountApi';
import { supabase } from '../supabase';

export type PostOrderAddonInitialization = {
  readonly available: boolean;
  readonly reason: string;
  readonly status: string;
  readonly orderGroupId: string;
  readonly offerId: string;
  readonly expiresAt: string;
  readonly addonDeliveryFee: number;
};

type InitializationRow = {
  available?: unknown;
  reason?: unknown;
  status?: unknown;
  order_group_id?: unknown;
  offer_id?: unknown;
  expires_at?: unknown;
  addon_delivery_fee?: unknown;
};

const mapInitialization = (value: unknown): PostOrderAddonInitialization | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as InitializationRow;
  return {
    available: row.available === true,
    reason: typeof row.reason === 'string' ? row.reason : '',
    status: typeof row.status === 'string' ? row.status : '',
    orderGroupId: typeof row.order_group_id === 'string' ? row.order_group_id : '',
    offerId: typeof row.offer_id === 'string' ? row.offer_id : '',
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : '',
    addonDeliveryFee: Number.isFinite(Number(row.addon_delivery_fee))
      ? Math.max(0, Number(row.addon_delivery_fee))
      : 0
  };
};

const rpcIsUnavailable = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('pgrst202')
    || normalized.includes('could not find the function')
    || normalized.includes('function not found');
};

export const initializePostOrderAddon = async (
  orderId: string
): Promise<PostOrderAddonInitialization | null> => {
  const normalizedOrderId = orderId.trim();
  const sessionToken = getStoredClientSessionToken();
  if (!supabase || !normalizedOrderId || !sessionToken) return null;

  const { data, error } = await supabase.rpc('initialize_post_order_addon', {
    target_order_id: normalizedOrderId,
    client_session_token: sessionToken
  });
  if (error) {
    if (rpcIsUnavailable(error.message ?? '')) return null;
    throw error;
  }
  return mapInitialization(data);
};
