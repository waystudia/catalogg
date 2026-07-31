import { supabase } from '../supabase';
import type { PlatformBillingSettings, PlatformCustomTariff, SubscriptionRow } from './platformTypes';

type SubscriptionQueryRow = {
  id: string;
  plan_code: string;
  amount: number | string | null;
  status: SubscriptionRow['status'];
  ends_at: string | null;
  paid_at: string | null;
  created_at: string;
  clients?: { company_name?: string } | Array<{ company_name?: string }> | null;
};

type PlatformBillingSettingsRow = {
  client_fee: number | string | null;
  restaurant_tariff_type: PlatformBillingSettings['restaurantTariffType'] | null;
  restaurant_commission_percent: number | string | null;
  restaurant_tariff_fixed: number | string | null;
  driver_tariff_type: PlatformBillingSettings['driverTariffType'] | null;
  driver_tariff_percent: number | string | null;
  driver_tariff_fixed: number | string | null;
  restaurant_debt_limit: number | string | null;
  driver_debt_limit: number | string | null;
  warning_percent: number | string | null;
};

type PlatformCustomTariffRow = {
  id: string;
  subject_type: PlatformCustomTariff['subjectType'];
  subject_id: string;
  tariff_type: PlatformCustomTariff['tariffType'] | null;
  tariff_percent: number | string | null;
  tariff_fixed: number | string | null;
  is_active: boolean;
};

const defaultBillingSettings: PlatformBillingSettings = {
  clientFee: 0,
  restaurantTariffType: 'percent',
  restaurantCommission: 7,
  restaurantFixedFee: 0,
  driverTariffType: 'percent',
  driverTariff: 5,
  driverFixedFee: 0,
  restaurantLimit: 5000,
  driverLimit: 3000,
  warningPercent: 80
};

const mapBillingSettings = (row: PlatformBillingSettingsRow | null | undefined): PlatformBillingSettings => ({
  clientFee: Number(row?.client_fee ?? defaultBillingSettings.clientFee),
  restaurantTariffType: row?.restaurant_tariff_type === 'fixed' ? 'fixed' : 'percent',
  restaurantCommission: Number(row?.restaurant_commission_percent ?? defaultBillingSettings.restaurantCommission),
  restaurantFixedFee: Number(row?.restaurant_tariff_fixed ?? defaultBillingSettings.restaurantFixedFee),
  driverTariffType: row?.driver_tariff_type === 'fixed' ? 'fixed' : 'percent',
  driverTariff: Number(row?.driver_tariff_percent ?? defaultBillingSettings.driverTariff),
  driverFixedFee: Number(row?.driver_tariff_fixed ?? defaultBillingSettings.driverFixedFee),
  restaurantLimit: Number(row?.restaurant_debt_limit ?? defaultBillingSettings.restaurantLimit),
  driverLimit: Number(row?.driver_debt_limit ?? defaultBillingSettings.driverLimit),
  warningPercent: Number(row?.warning_percent ?? defaultBillingSettings.warningPercent)
});

export type RestaurantBillingTariff = {
  tariffType: 'percent' | 'fixed';
  tariffPercent: number;
  tariffFixed: number;
};

export async function getCurrentRestaurantBillingTariff(
  catalogSlug: string
): Promise<RestaurantBillingTariff | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_current_restaurant_billing_tariff', {
    target_catalog_slug: catalogSlug.trim().toLowerCase()
  });
  if (error || !data || typeof data !== 'object') return null;

  const row = data as {
    tariff_type?: unknown;
    tariff_percent?: unknown;
    tariff_fixed?: unknown;
  };
  return {
    tariffType: row.tariff_type === 'fixed' ? 'fixed' : 'percent',
    tariffPercent: Number(row.tariff_percent ?? 0),
    tariffFixed: Number(row.tariff_fixed ?? 0)
  };
}

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('id, plan_code, amount, status, ends_at, paid_at, created_at, clients(company_name)')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) return [];

  return ((data ?? []) as SubscriptionQueryRow[]).map((row) => ({
    id: row.id,
    clientName: (Array.isArray(row.clients) ? row.clients[0]?.company_name : row.clients?.company_name) ?? 'Клиент',
    planCode: row.plan_code,
    amount: Number(row.amount ?? 0),
    status: row.status,
    endsAt: row.ends_at,
    paidAt: row.paid_at,
    createdAt: row.created_at
  }));
}

export async function getPlatformBillingSettings(): Promise<PlatformBillingSettings | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('platform_billing_settings')
    .select('client_fee, restaurant_tariff_type, restaurant_commission_percent, restaurant_tariff_fixed, driver_tariff_type, driver_tariff_percent, driver_tariff_fixed, restaurant_debt_limit, driver_debt_limit, warning_percent')
    .eq('id', 'global')
    .maybeSingle();

  if (error) return null;
  return mapBillingSettings(data as PlatformBillingSettingsRow | null);
}

export async function savePlatformBillingSettings(input: PlatformBillingSettings): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('platform_billing_settings').upsert({
    id: 'global',
    client_fee: input.clientFee,
    restaurant_tariff_type: input.restaurantTariffType,
    restaurant_commission_percent: input.restaurantCommission,
    restaurant_tariff_fixed: input.restaurantFixedFee,
    driver_tariff_type: input.driverTariffType,
    driver_tariff_percent: input.driverTariff,
    driver_tariff_fixed: input.driverFixedFee,
    restaurant_debt_limit: input.restaurantLimit,
    driver_debt_limit: input.driverLimit,
    warning_percent: input.warningPercent,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

  if (error) return false;
  return true;
}

export async function getPlatformCustomTariffs(): Promise<PlatformCustomTariff[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('platform_custom_tariffs')
    .select('id, subject_type, subject_id, tariff_type, tariff_percent, tariff_fixed, is_active')
    .eq('is_active', true);

  if (error) return [];
  return ((data ?? []) as PlatformCustomTariffRow[]).map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    tariffType: row.tariff_type === 'fixed' ? 'fixed' : 'percent',
    tariffPercent: Number(row.tariff_percent ?? 0),
    tariffFixed: Number(row.tariff_fixed ?? 0),
    isActive: row.is_active
  }));
}

export async function savePlatformCustomTariff(input: {
  subject: string;
  tariffType: PlatformCustomTariff['tariffType'];
  tariffPercent: number;
  tariffFixed: number;
}): Promise<boolean> {
  if (!supabase) return false;

  const [subjectType, subjectId] = input.subject.split(':');
  const tariffPercent = Number(input.tariffPercent);
  const tariffFixed = Number(input.tariffFixed);
  if (
    (subjectType !== 'restaurant' && subjectType !== 'driver') ||
    !subjectId ||
    !['percent', 'fixed'].includes(input.tariffType) ||
    !Number.isFinite(tariffPercent) ||
    tariffPercent < 0 ||
    !Number.isFinite(tariffFixed) ||
    tariffFixed < 0
  ) {
    throw new Error('Выберите ресторан или водителя и укажите корректный тариф.');
  }

  const { error } = await supabase.from('platform_custom_tariffs').upsert({
    subject_type: subjectType,
    subject_id: subjectId,
    tariff_type: input.tariffType,
    tariff_percent: tariffPercent,
    tariff_fixed: tariffFixed,
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'subject_type,subject_id' });

  if (error) return false;
  return true;
}
