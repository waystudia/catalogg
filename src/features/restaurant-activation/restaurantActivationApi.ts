import { signOutCatalogAdmin } from '../../shared/api/catalogAdminApi';
import { supabase } from '../../shared/supabase';
import type {
  ActivationConfirmations,
  RestaurantLegalStatus,
  RestaurantMemberRole
} from './restaurantActivation';

export type RestaurantActivationDocument = {
  id: string;
  type: string;
  title: string;
  version: string;
  effectiveFrom: string | null;
  pdfUrl: string | null;
  fileHash: string;
  opened: boolean;
};

export type RestaurantActivationView = {
  clientId: string;
  catalogId: string;
  catalogSlug: string;
  legalStatus: RestaurantLegalStatus;
  canAcceptLegalDocuments: boolean;
  memberRole: RestaurantMemberRole;
  restaurant: {
    name: string;
    organizationType?: string | null;
    legalName: string | null;
    inn: string | null;
    ogrn?: string | null;
    legalAddress?: string | null;
    actualAddress: string | null;
    directorFullName?: string | null;
    representativeFullName: string | null;
    authorityBasis: string | null;
    phone: string | null;
    email: string | null;
    deliveryModel: string | null;
  };
  tariff: {
    name: string;
    restaurantCommissionAmount: number;
    driverCommissionAmount: number;
    version: string;
    effectiveFrom: string | null;
    freePeriodTerms?: string | null;
    commissionRules?: string | null;
    individualTerms?: string | null;
  } | null;
  bundleId: string | null;
  bundleVersion: string | null;
  documents: RestaurantActivationDocument[];
  pendingRequestId: string | null;
};

export type RestaurantActivationService = {
  loadCurrent: () => Promise<RestaurantActivationView>;
  markDocumentOpened: (documentId: string) => Promise<void>;
  requestCode: (input: {
    bundleId: string;
    idempotencyKey: string;
    confirmations: ActivationConfirmations;
    openedDocumentIds: string[];
    marketingConsents: Record<string, boolean>;
  }) => Promise<{ requestId: string; status: string }>;
  confirmActivation: (
    requestId: string,
    code: string
  ) => Promise<{ ok: boolean; acceptanceId?: string; legalStatus?: RestaurantLegalStatus; error?: string }>;
  signOut: () => Promise<void>;
};

type ActivationRpcRow = {
  client_id: string;
  catalog_id: string;
  catalog_slug: string;
  legal_status: RestaurantLegalStatus;
  can_accept_legal_documents: boolean;
  member_role: RestaurantMemberRole;
  restaurant: {
    name?: string;
    legal_name?: string | null;
    inn?: string | null;
    actual_address?: string | null;
    representative_full_name?: string | null;
    authority_basis?: string | null;
    phone?: string | null;
    email?: string | null;
    delivery_model?: string | null;
  };
  tariff?: {
    name?: string;
    restaurant_commission_amount?: number | string;
    driver_commission_amount?: number | string;
    version?: string;
    effective_from?: string | null;
  } | null;
  bundle_id?: string | null;
  bundle_version?: string | null;
  documents?: Array<{
    id: string;
    type: string;
    title: string;
    version: string;
    effective_from?: string | null;
    pdf_url?: string | null;
    file_hash: string;
    opened?: boolean;
  }>;
  pending_request_id?: string | null;
};

type ActivationProfileDetailsRpcRow = {
  organization_type?: string | null;
  ogrn?: string | null;
  legal_address?: string | null;
  director_full_name?: string | null;
  free_period_terms?: string | null;
  commission_rules?: string | null;
  individual_terms?: string | null;
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Подключение к WayYaam временно недоступно.');
  return supabase;
};

const mapActivationView = (
  row: ActivationRpcRow,
  details: ActivationProfileDetailsRpcRow = {}
): RestaurantActivationView => ({
  clientId: row.client_id,
  catalogId: row.catalog_id,
  catalogSlug: row.catalog_slug,
  legalStatus: row.legal_status,
  canAcceptLegalDocuments: row.can_accept_legal_documents,
  memberRole: row.member_role,
  restaurant: {
    name: row.restaurant?.name ?? '',
    organizationType: details.organization_type ?? null,
    legalName: row.restaurant?.legal_name ?? null,
    inn: row.restaurant?.inn ?? null,
    ogrn: details.ogrn ?? null,
    legalAddress: details.legal_address ?? null,
    actualAddress: row.restaurant?.actual_address ?? null,
    directorFullName: details.director_full_name ?? null,
    representativeFullName: row.restaurant?.representative_full_name ?? null,
    authorityBasis: row.restaurant?.authority_basis ?? null,
    phone: row.restaurant?.phone ?? null,
    email: row.restaurant?.email ?? null,
    deliveryModel: row.restaurant?.delivery_model ?? null
  },
  tariff: row.tariff
    ? {
        name: row.tariff.name ?? '',
        restaurantCommissionAmount: Number(row.tariff.restaurant_commission_amount ?? 0),
        driverCommissionAmount: Number(row.tariff.driver_commission_amount ?? 0),
        version: row.tariff.version ?? '',
        effectiveFrom: row.tariff.effective_from ?? null,
        freePeriodTerms: details.free_period_terms ?? null,
        commissionRules: details.commission_rules ?? null,
        individualTerms: details.individual_terms ?? null
      }
    : null,
  bundleId: row.bundle_id ?? null,
  bundleVersion: row.bundle_version ?? null,
  documents: (row.documents ?? []).map((document) => ({
    id: document.id,
    type: document.type,
    title: document.title,
    version: document.version,
    effectiveFrom: document.effective_from ?? null,
    pdfUrl: document.pdf_url ?? null,
    fileHash: document.file_hash,
    opened: document.opened === true
  })),
  pendingRequestId: row.pending_request_id ?? null
});

const rpcError = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || 'Не удалось выполнить запрос активации.');
};

export const restaurantActivationApi: RestaurantActivationService = {
  async loadCurrent() {
    const client = requireSupabase();
    const [{ data, error }, { data: details, error: detailsError }] = await Promise.all([
      client.rpc('get_current_restaurant_activation'),
      client.rpc('get_current_restaurant_activation_profile_details')
    ]);
    rpcError(error);
    rpcError(detailsError);
    if (!data) throw new Error('Данные ресторана для активации не найдены.');
    return mapActivationView(data as ActivationRpcRow, (details ?? {}) as ActivationProfileDetailsRpcRow);
  },

  async markDocumentOpened(documentId) {
    const client = requireSupabase();
    const { error } = await client.rpc('mark_restaurant_activation_document_opened', {
      target_document_id: documentId
    });
    rpcError(error);
  },

  async requestCode({ bundleId, idempotencyKey, confirmations, openedDocumentIds, marketingConsents }) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('request_restaurant_activation_code', {
      target_bundle_id: bundleId,
      target_checkboxes: confirmations,
      target_opened_document_ids: openedDocumentIds,
      target_marketing_consents: marketingConsents,
      target_idempotency_key: idempotencyKey
    });
    rpcError(error);
    const result = data as { request_id?: string; status?: string } | null;
    if (!result?.request_id) throw new Error('Запрос кода не был создан.');
    return { requestId: result.request_id, status: result.status ?? 'awaiting_manual_code' };
  },

  async confirmActivation(requestId, code) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('confirm_restaurant_activation', {
      target_request_id: requestId,
      target_code: code
    });
    rpcError(error);
    const result = data as {
      ok?: boolean;
      acceptance_id?: string;
      legal_status?: RestaurantLegalStatus;
      error?: string;
    } | null;
    return {
      ok: result?.ok === true,
      acceptanceId: result?.acceptance_id,
      legalStatus: result?.legal_status,
      error: result?.error
    };
  },

  signOut: signOutCatalogAdmin
};
