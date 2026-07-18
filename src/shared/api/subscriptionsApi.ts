import { supabase } from '../supabase';
import type { PlatformBillingSettings, PlatformCustomTariff, SubscriptionRow } from './platformTypes';

type SubscriptionQueryRow = {
  id: string;
  plan_code: string;
  amount: number | string | null;
  status: SubscriptionRow['status'];
  ends_at: string | null;
  clients?: { company_name?: string } | Array<{ company_name?: string }> | null;
};

type PlatformBillingSettingsRow = {
  client_fee: number | string | null;
  restaurant_commission_percent: number | string | null;
  driver_tariff_percent: number | string | null;
  restaurant_debt_limit: number | string | null;
  driver_debt_limit: number | string | null;
  warning_percent: number | string | null;
};

type PlatformCustomTariffRow = {
  id: string;
  subject_type: PlatformCustomTariff['subjectType'];
  subject_id: string;
  tariff_percent: number | string | null;
  is_active: boolean;
};

const defaultBillingSettings: PlatformBillingSettings = {
  clientFee: 0,
  restaurantCommission: 7,
  driverTariff: 5,
  restaurantLimit: 5000,
  driverLimit: 3000,
  warningPercent: 80
};

const mapBillingSettings = (row: PlatformBillingSettingsRow | null | undefined): PlatformBillingSettings => ({
  clientFee: Number(row?.client_fee ?? defaultBillingSettings.clientFee),
  restaurantCommission: Number(row?.restaurant_commission_percent ?? defaultBillingSettings.restaurantCommission),
  driverTariff: Number(row?.driver_tariff_percent ?? defaultBillingSettings.driverTariff),
  restaurantLimit: Number(row?.restaurant_debt_limit ?? defaultBillingSettings.restaurantLimit),
  driverLimit: Number(row?.driver_debt_limit ?? defaultBillingSettings.driverLimit),
  warningPercent: Number(row?.warning_percent ?? defaultBillingSettings.warningPercent)
});

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('id, plan_code, amount, status, ends_at, clients(company_name)')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) return [];

  return ((data ?? []) as SubscriptionQueryRow[]).map((row) => ({
    id: row.id,
    clientName: (Array.isArray(row.clients) ? row.clients[0]?.company_name : row.clients?.company_name) ?? 'Клиент',
    planCode: row.plan_code,
    amount: Number(row.amount ?? 0),
    status: row.status,
    endsAt: row.ends_at
  }));
}

export async function getPlatformBillingSettings(): Promise<PlatformBillingSettings | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('platform_billing_settings')
    .select('client_fee, restaurant_commission_percent, driver_tariff_percent, restaurant_debt_limit, driver_debt_limit, warning_percent')
    .eq('id', 'global')
    .maybeSingle();

  if (error) return null;
  return mapBillingSettings(data as PlatformBillingSettingsRow | null);
}

export async function savePlatformBillingSettings(input: PlatformBillingSettings) {
  if (!supabase) return;

  const { error } = await supabase.from('platform_billing_settings').upsert({
    id: 'global',
    client_fee: input.clientFee,
    restaurant_commission_percent: input.restaurantCommission,
    driver_tariff_percent: input.driverTariff,
    restaurant_debt_limit: input.restaurantLimit,
    driver_debt_limit: input.driverLimit,
    warning_percent: input.warningPercent,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

  if (error) throw error;
}

export async function getPlatformCustomTariffs(): Promise<PlatformCustomTariff[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('platform_custom_tariffs')
    .select('id, subject_type, subject_id, tariff_percent, is_active')
    .eq('is_active', true);

  if (error) return [];
  return ((data ?? []) as PlatformCustomTariffRow[]).map((row) => ({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    tariffPercent: Number(row.tariff_percent ?? 0),
    isActive: row.is_active
  }));
}

export async function savePlatformCustomTariff(input: {
  subject: string;
  tariffPercent: number;
}) {
  if (!supabase) return;

  const [subjectType, subjectId] = input.subject.split(':');
  const tariffPercent = Number(input.tariffPercent);
  if ((subjectType !== 'restaurant' && subjectType !== 'driver') || !subjectId || !Number.isFinite(tariffPercent) || tariffPercent < 0) {
    throw new Error('Выберите ресторан или водителя и укажите корректный тариф.');
  }

  const { error } = await supabase.from('platform_custom_tariffs').upsert({
    subject_type: subjectType,
    subject_id: subjectId,
    tariff_percent: tariffPercent,
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'subject_type,subject_id' });

  if (error) throw error;
}
