import { supabase } from '../../shared/supabase';
import type { RestaurantLegalStatus } from '../restaurant-activation/restaurantActivation';

export type RestaurantActivationAdminRow = {
  clientId: string;
  catalogId: string;
  restaurantName: string;
  ownerName: string | null;
  phone: string | null;
  legalStatus: RestaurantLegalStatus;
  bundleVersion: string | null;
  acceptedAt: string | null;
  confirmationMethod: string | null;
  pendingRequestId: string | null;
  missingSetup: string[];
};

export type RestaurantActivationAdminService = {
  list: () => Promise<RestaurantActivationAdminRow[]>;
  finishSetup: (clientId: string) => Promise<{ ready: boolean; missing: string[] }>;
  issueManualCode: (requestId: string) => Promise<{
    requestId: string;
    code: string;
    expiresAt: string;
    destinationMasked: string | null;
  }>;
};

type AdminRow = {
  client_id: string;
  catalog_id: string;
  restaurant_name: string;
  owner_name?: string | null;
  phone?: string | null;
  legal_status: RestaurantLegalStatus;
  bundle_version?: string | null;
  accepted_at?: string | null;
  confirmation_method?: string | null;
  pending_request_id?: string | null;
  missing_setup?: string[];
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase не подключён.');
  return supabase;
};

const ensureSuccess = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || 'Операция активации не выполнена.');
};

export const restaurantActivationAdminApi: RestaurantActivationAdminService = {
  async list() {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_admin_restaurant_activations');
    ensureSuccess(error);
    return ((data ?? []) as AdminRow[]).map((row) => ({
      clientId: row.client_id,
      catalogId: row.catalog_id,
      restaurantName: row.restaurant_name,
      ownerName: row.owner_name ?? null,
      phone: row.phone ?? null,
      legalStatus: row.legal_status,
      bundleVersion: row.bundle_version ?? null,
      acceptedAt: row.accepted_at ?? null,
      confirmationMethod: row.confirmation_method ?? null,
      pendingRequestId: row.pending_request_id ?? null,
      missingSetup: row.missing_setup ?? []
    }));
  },

  async finishSetup(clientId) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('finish_restaurant_legal_setup', { target_client_id: clientId });
    ensureSuccess(error);
    const result = data as { ready?: boolean; missing?: string[] } | null;
    return { ready: result?.ready === true, missing: result?.missing ?? [] };
  },

  async issueManualCode(requestId) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('admin_issue_restaurant_activation_code', {
      target_request_id: requestId
    });
    ensureSuccess(error);
    const result = data as {
      request_id?: string;
      code?: string;
      expires_at?: string;
      destination_masked?: string | null;
    } | null;
    if (!result?.request_id || !result.code || !result.expires_at) throw new Error('Код не был создан.');
    return {
      requestId: result.request_id,
      code: result.code,
      expiresAt: result.expires_at,
      destinationMasked: result.destination_masked ?? null
    };
  }
};
