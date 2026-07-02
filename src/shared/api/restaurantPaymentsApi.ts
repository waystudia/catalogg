import { supabase } from '../supabase';
import {
  defaultPaymentSettings,
  loadPaymentSettings,
  savePaymentSettings,
  type RestaurantPaymentSettings
} from '../paymentSettings';

export type PaymentCatalogOption = {
  id: string;
  slug: string;
  name: string;
};

type PaymentRow = {
  restaurant_id: string;
  enable_transfer: boolean;
  requisite_type: 'phone' | 'card' | 'account';
  phone_number: string;
  bank_name: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  display_name: string;
  comment: string;
  allow_cash: boolean;
  require_confirmation: boolean;
  qr_image_url: string;
};

const paymentSelect = `
  restaurant_id,
  enable_transfer,
  requisite_type,
  phone_number,
  bank_name,
  first_name,
  last_name,
  middle_name,
  display_name,
  comment,
  allow_cash,
  require_confirmation,
  qr_image_url
`;

const mapPaymentRow = (row?: Partial<PaymentRow> | null): RestaurantPaymentSettings => ({
  transferEnabled: row?.enable_transfer ?? defaultPaymentSettings.transferEnabled,
  requisiteType: row?.requisite_type ?? defaultPaymentSettings.requisiteType,
  transferNumber: row?.phone_number ?? defaultPaymentSettings.transferNumber,
  bankName: row?.bank_name ?? defaultPaymentSettings.bankName,
  firstName: row?.first_name ?? defaultPaymentSettings.firstName,
  lastName: row?.last_name ?? defaultPaymentSettings.lastName,
  middleName: row?.middle_name ?? defaultPaymentSettings.middleName,
  displayName: row?.display_name ?? defaultPaymentSettings.displayName,
  comment: row?.comment ?? defaultPaymentSettings.comment,
  allowCash: row?.allow_cash ?? defaultPaymentSettings.allowCash,
  requireConfirmation: row?.require_confirmation ?? defaultPaymentSettings.requireConfirmation,
  qrUrl: row?.qr_image_url ?? defaultPaymentSettings.qrUrl
});

const toPaymentRow = (restaurantId: string, settings: RestaurantPaymentSettings): PaymentRow => ({
  restaurant_id: restaurantId,
  enable_transfer: settings.transferEnabled,
  requisite_type: settings.requisiteType,
  phone_number: settings.transferNumber,
  bank_name: settings.bankName,
  first_name: settings.firstName,
  last_name: settings.lastName,
  middle_name: settings.middleName,
  display_name: settings.displayName,
  comment: settings.comment,
  allow_cash: settings.allowCash,
  require_confirmation: settings.requireConfirmation,
  qr_image_url: settings.qrUrl
});

export async function getPaymentCatalogs(): Promise<PaymentCatalogOption[]> {
  if (!supabase) {
    return [
      { id: 'demo-mangal', slug: 'mangal', name: 'Мангал' },
      { id: 'demo-rizih', slug: 'rizih', name: 'Rizih' }
    ];
  }

  const { data: platformAdmin } = await supabase.rpc('is_platform_admin');
  if (platformAdmin) {
    const { data, error } = await supabase
      .from('catalogs')
      .select('id, slug, name')
      .order('name');
    if (error) throw error;
    return (data ?? []).map((catalog) => ({
      id: String(catalog.id),
      slug: String(catalog.slug),
      name: String(catalog.name)
    }));
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('clients')
    .select('catalogs(id, slug, name)')
    .eq('owner_user_id', userId);
  if (error) throw error;

  return (data ?? [])
    .flatMap((row) => {
      const catalog = row.catalogs as { id?: string; slug?: string; name?: string } | { id?: string; slug?: string; name?: string }[] | null;
      return Array.isArray(catalog) ? catalog : catalog ? [catalog] : [];
    })
    .filter((catalog) => catalog.id && catalog.slug)
    .map((catalog) => ({
      id: String(catalog.id),
      slug: String(catalog.slug),
      name: String(catalog.name ?? catalog.slug)
    }));
}

export async function getRestaurantPayments(restaurantId: string, slug?: string): Promise<RestaurantPaymentSettings> {
  if (!supabase) return loadPaymentSettings(slug ?? restaurantId);

  const { data, error } = await supabase
    .from('restaurant_payments')
    .select(paymentSelect)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (error) throw error;

  return { ...loadPaymentSettings(slug ?? restaurantId), ...mapPaymentRow(data as PaymentRow | null) };
}

export async function getRestaurantPaymentsBySlug(slug: string): Promise<RestaurantPaymentSettings> {
  if (!supabase) return loadPaymentSettings(slug);

  const { data: catalog, error: catalogError } = await supabase
    .from('catalogs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (catalogError || !catalog) return loadPaymentSettings(slug);

  return getRestaurantPayments(String(catalog.id), slug);
}

export async function saveRestaurantPayments(
  restaurantId: string,
  slug: string,
  settings: RestaurantPaymentSettings
) {
  savePaymentSettings(slug, settings);
  if (!supabase) return;

  const { error } = await supabase
    .from('restaurant_payments')
    .upsert(toPaymentRow(restaurantId, settings), { onConflict: 'restaurant_id' });
  if (error) throw error;
}
