import { supabase } from '../supabase';

export type BillingDebtStatus = {
  accountType: 'restaurant' | 'driver';
  accountId: string;
  debtAmount: number;
  warningAmount: number;
  limitAmount: number;
  graceHours: number;
  limitReachedAt: string | null;
  deadline: string | null;
  blocked: boolean;
  blockedAt: string | null;
};

type BillingDebtStatusRow = {
  account_type?: unknown;
  account_id?: unknown;
  debt_amount?: unknown;
  warning_amount?: unknown;
  limit_amount?: unknown;
  grace_hours?: unknown;
  limit_reached_at?: unknown;
  deadline?: unknown;
  blocked?: unknown;
  blocked_at?: unknown;
};

const optionalString = (value: unknown) => typeof value === 'string' && value ? value : null;

export async function getCurrentBillingDebtStatus(): Promise<BillingDebtStatus | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_current_billing_debt_status');
  if (error) {
    if (/billing_account_not_found/i.test(error.message)) return null;
    throw error;
  }

  const row = data as BillingDebtStatusRow | null;
  const accountType = row?.account_type;
  const accountId = optionalString(row?.account_id);
  if ((accountType !== 'restaurant' && accountType !== 'driver') || !accountId) return null;

  return {
    accountType,
    accountId,
    debtAmount: Number(row?.debt_amount ?? 0),
    warningAmount: Number(row?.warning_amount ?? 4_000),
    limitAmount: Number(row?.limit_amount ?? 5_000),
    graceHours: Number(row?.grace_hours ?? 24),
    limitReachedAt: optionalString(row?.limit_reached_at),
    deadline: optionalString(row?.deadline),
    blocked: row?.blocked === true,
    blockedAt: optionalString(row?.blocked_at)
  };
}
