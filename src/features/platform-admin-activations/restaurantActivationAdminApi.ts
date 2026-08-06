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

export type RestaurantActivationAdminProfile = {
  organizationType: string;
  legalName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
  actualAddress: string;
  restaurantPhone: string;
  restaurantEmail: string;
  directorFullName: string;
  representativeFullName: string;
  authorityBasis: string;
  primaryConfirmationPhone: string;
  primaryConfirmationEmail: string;
  deliveryModel: string;
};

export type RestaurantActivationAdminTariff = {
  name: string;
  restaurantCommissionAmount: number;
  driverCommissionAmount: number;
  version: string;
  startsAt: string;
  freePeriodTerms: string;
  commissionRules: string;
  individualTerms: string;
};

export type RestaurantActivationAdminSetup = {
  clientId: string;
  catalogId: string;
  catalogSlug: string;
  restaurantName: string;
  legalStatus: RestaurantLegalStatus;
  logoUrl: string;
  profile: RestaurantActivationAdminProfile;
  tariff: RestaurantActivationAdminTariff | null;
  bundle: { id: string; title: string; version: string; effectiveFrom: string | null } | null;
  missingSetup: string[];
};

export type RestaurantActivationAdminSetupInput = Pick<RestaurantActivationAdminSetup, 'logoUrl' | 'profile'> & {
  tariff: RestaurantActivationAdminTariff;
};

export type RestaurantActivationAdminService = {
  list: () => Promise<RestaurantActivationAdminRow[]>;
  loadSetup: (clientId: string) => Promise<RestaurantActivationAdminSetup>;
  uploadLogo: (clientId: string, file: File) => Promise<string>;
  saveSetup: (clientId: string, input: RestaurantActivationAdminSetupInput) => Promise<RestaurantActivationAdminSetup>;
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

type AdminSetupRow = {
  client_id: string;
  catalog_id: string;
  catalog_slug: string;
  restaurant_name: string;
  legal_status: RestaurantLegalStatus;
  logo_url?: string | null;
  profile?: Record<string, string | null>;
  tariff?: Record<string, string | number | null> | null;
  bundle?: { id: string; title: string; version: string; effective_from?: string | null } | null;
  missing_setup?: string[];
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase не подключён.');
  return supabase;
};

const ensureSuccess = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || 'Операция активации не выполнена.');
};

const textValue = (value: unknown) => typeof value === 'string' ? value : '';

const mapAdminSetup = (row: AdminSetupRow): RestaurantActivationAdminSetup => ({
  clientId: row.client_id,
  catalogId: row.catalog_id,
  catalogSlug: row.catalog_slug,
  restaurantName: row.restaurant_name,
  legalStatus: row.legal_status,
  logoUrl: row.logo_url ?? '',
  profile: {
    organizationType: textValue(row.profile?.organization_type),
    legalName: textValue(row.profile?.legal_name),
    inn: textValue(row.profile?.inn),
    ogrn: textValue(row.profile?.ogrn),
    legalAddress: textValue(row.profile?.legal_address),
    actualAddress: textValue(row.profile?.actual_address),
    restaurantPhone: textValue(row.profile?.restaurant_phone),
    restaurantEmail: textValue(row.profile?.restaurant_email),
    directorFullName: textValue(row.profile?.director_full_name),
    representativeFullName: textValue(row.profile?.representative_full_name),
    authorityBasis: textValue(row.profile?.authority_basis),
    primaryConfirmationPhone: textValue(row.profile?.primary_confirmation_phone),
    primaryConfirmationEmail: textValue(row.profile?.primary_confirmation_email),
    deliveryModel: textValue(row.profile?.delivery_model)
  },
  tariff: row.tariff ? {
    name: textValue(row.tariff.name),
    restaurantCommissionAmount: Number(row.tariff.restaurant_commission_amount ?? 30),
    driverCommissionAmount: Number(row.tariff.driver_commission_amount ?? 30),
    version: textValue(row.tariff.version),
    startsAt: textValue(row.tariff.starts_at),
    freePeriodTerms: textValue(row.tariff.free_period_terms),
    commissionRules: textValue(row.tariff.commission_rules),
    individualTerms: textValue(row.tariff.individual_terms)
  } : null,
  bundle: row.bundle ? {
    id: row.bundle.id,
    title: row.bundle.title,
    version: row.bundle.version,
    effectiveFrom: row.bundle.effective_from ?? null
  } : null,
  missingSetup: row.missing_setup ?? []
});

const serializeSetup = (input: RestaurantActivationAdminSetupInput) => ({
  target_logo_url: input.logoUrl,
  target_profile: {
    organization_type: input.profile.organizationType,
    legal_name: input.profile.legalName,
    inn: input.profile.inn,
    ogrn: input.profile.ogrn,
    legal_address: input.profile.legalAddress,
    actual_address: input.profile.actualAddress,
    restaurant_phone: input.profile.restaurantPhone,
    restaurant_email: input.profile.restaurantEmail,
    director_full_name: input.profile.directorFullName,
    representative_full_name: input.profile.representativeFullName,
    authority_basis: input.profile.authorityBasis,
    primary_confirmation_phone: input.profile.primaryConfirmationPhone,
    primary_confirmation_email: input.profile.primaryConfirmationEmail,
    delivery_model: input.profile.deliveryModel
  },
  target_tariff: {
    name: input.tariff.name,
    restaurant_commission_amount: input.tariff.restaurantCommissionAmount,
    driver_commission_amount: input.tariff.driverCommissionAmount,
    version: input.tariff.version,
    starts_at: input.tariff.startsAt,
    free_period_terms: input.tariff.freePeriodTerms,
    commission_rules: input.tariff.commissionRules,
    individual_terms: input.tariff.individualTerms
  }
});

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

  async loadSetup(clientId) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_admin_restaurant_activation_setup', {
      target_client_id: clientId
    });
    ensureSuccess(error);
    if (!data) throw new Error('Настройка ресторана не найдена.');
    return mapAdminSetup(data as AdminSetupRow);
  },

  async uploadLogo(clientId, file) {
    if (!file.type.startsWith('image/')) throw new Error('Выберите изображение');
    if (file.size > 6 * 1024 * 1024) throw new Error('Размер логотипа не должен превышать 6 МБ');
    const client = requireSupabase();
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const safeClientId = clientId.replace(/[^a-zA-Z0-9-]/g, '') || 'restaurant';
    const storagePath = `restaurant-activation-logos/${safeClientId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const bucket = client.storage.from('platform-banner-media');
    const { error } = await bucket.upload(storagePath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });
    ensureSuccess(error);
    return bucket.getPublicUrl(storagePath).data.publicUrl;
  },

  async saveSetup(clientId, input) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('save_admin_restaurant_activation_setup', {
      target_client_id: clientId,
      ...serializeSetup(input)
    });
    ensureSuccess(error);
    if (!data) throw new Error('Данные ресторана не были сохранены.');
    return mapAdminSetup(data as AdminSetupRow);
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
