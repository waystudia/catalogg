import { supabase } from '../supabase';

export type CommercialFeeType = 'free' | 'fixed' | 'percent' | 'fixed_percent';
export type CommercialRuleDraft = {
  sourceTypeCode: string;
  feeType: CommercialFeeType;
  fixedAmount: number;
  percentRate: number;
  minimumAmount: number | null;
  maximumAmount: number | null;
};

export type CommercialProfile = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  attributionWindowDays: number;
  attributionStrategy: 'last_valid_touch' | 'first_valid_touch';
  rules: CommercialRuleDraft[];
  assignedBusinesses: number;
};

export type CommercialAssignment = { catalogId: string; profileId: string; assignedAt: string };

type ProfileRow = {
  id: string; name: string; description: string; status: 'active' | 'archived';
  attribution_window_days: number; attribution_strategy: 'last_valid_touch' | 'first_valid_touch';
};
type RuleRow = {
  profile_id: string; source_type_code: string; fee_type: CommercialFeeType;
  fixed_amount: number; percent_rate: number; minimum_amount: number | null; maximum_amount: number | null;
};

const numberOrNull = (value: number | null | undefined) => value === null || value === undefined || value === 0 ? null : Number(value);
const sanitizeRules = (rules: CommercialRuleDraft[]) => rules.map((rule) => ({
  source_type_code: rule.sourceTypeCode.trim().toUpperCase(),
  fee_type: rule.feeType,
  fixed_amount: rule.feeType === 'percent' || rule.feeType === 'free' ? 0 : Math.max(0, Number(rule.fixedAmount) || 0),
  percent_rate: rule.feeType === 'fixed' || rule.feeType === 'free' ? 0 : Math.max(0, Number(rule.percentRate) || 0),
  minimum_amount: numberOrNull(rule.minimumAmount),
  maximum_amount: numberOrNull(rule.maximumAmount),
  is_active: true
}));

export async function getCommercialProfiles(): Promise<CommercialProfile[]> {
  if (!supabase) return [];
  const [{ data: profiles, error: profilesError }, { data: rules, error: rulesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from('commercial_profiles').select('id,name,description,status,attribution_window_days,attribution_strategy').order('created_at', { ascending: false }),
    supabase.from('commercial_profile_rules').select('profile_id,source_type_code,fee_type,fixed_amount,percent_rate,minimum_amount,maximum_amount').eq('is_active', true),
    supabase.from('commercial_profile_assignments').select('catalog_id,profile_id,assigned_at')
  ]);
  if (profilesError) throw profilesError;
  if (rulesError) throw rulesError;
  if (assignmentsError) throw assignmentsError;
  const rulesByProfile = new Map<string, CommercialRuleDraft[]>();
  ((rules ?? []) as RuleRow[]).forEach((rule) => {
    const current = rulesByProfile.get(rule.profile_id) ?? [];
    current.push({ sourceTypeCode: rule.source_type_code, feeType: rule.fee_type, fixedAmount: Number(rule.fixed_amount), percentRate: Number(rule.percent_rate), minimumAmount: rule.minimum_amount === null ? null : Number(rule.minimum_amount), maximumAmount: rule.maximum_amount === null ? null : Number(rule.maximum_amount) });
    rulesByProfile.set(rule.profile_id, current);
  });
  const assignmentCount = new Map<string, number>();
  (assignments ?? []).forEach((assignment: { profile_id: string }) => assignmentCount.set(assignment.profile_id, (assignmentCount.get(assignment.profile_id) ?? 0) + 1));
  return ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    id: profile.id, name: profile.name, description: profile.description, status: profile.status,
    attributionWindowDays: profile.attribution_window_days, attributionStrategy: profile.attribution_strategy,
    rules: rulesByProfile.get(profile.id) ?? [], assignedBusinesses: assignmentCount.get(profile.id) ?? 0
  }));
}

export async function getCommercialAssignments(): Promise<CommercialAssignment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('commercial_profile_assignments').select('catalog_id,profile_id,assigned_at');
  if (error) throw error;
  return (data ?? []).map((row: { catalog_id: string; profile_id: string; assigned_at: string }) => ({ catalogId: row.catalog_id, profileId: row.profile_id, assignedAt: row.assigned_at }));
}

export async function saveCommercialProfile(input: Omit<CommercialProfile, 'id' | 'assignedBusinesses'> & { id?: string }) {
  if (!supabase) return null;
  const profilePayload = {
    ...(input.id ? { id: input.id } : {}), name: input.name.trim(), description: input.description.trim(), status: input.status,
    attribution_window_days: Math.max(1, Math.min(365, Math.round(input.attributionWindowDays))), attribution_strategy: input.attributionStrategy,
    updated_at: new Date().toISOString()
  };
  const { data: profile, error } = await supabase.from('commercial_profiles').upsert(profilePayload).select('id').single();
  if (error) throw error;
  const profileId = String(profile.id);
  const { error: deleteError } = await supabase.from('commercial_profile_rules').delete().eq('profile_id', profileId);
  if (deleteError) throw deleteError;
  const rules = sanitizeRules(input.rules).map((rule) => ({ ...rule, profile_id: profileId }));
  if (rules.length > 0) {
    const { error: ruleError } = await supabase.from('commercial_profile_rules').insert(rules);
    if (ruleError) throw ruleError;
  }
  return profileId;
}

export async function archiveCommercialProfile(profileId: string) {
  if (!supabase) return;
  const { error } = await supabase.from('commercial_profiles').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', profileId);
  if (error) throw error;
}

export async function duplicateCommercialProfile(profile: CommercialProfile) {
  return saveCommercialProfile({
    name: `${profile.name} — копия`, description: profile.description, status: 'active',
    attributionWindowDays: profile.attributionWindowDays, attributionStrategy: profile.attributionStrategy,
    rules: profile.rules
  });
}

export async function assignCommercialProfile(catalogIds: string[], profileId: string, reason = '') {
  if (!supabase || catalogIds.length === 0) return;
  const { error } = await supabase.from('commercial_profile_assignments').upsert(
    catalogIds.map((catalogId) => ({ catalog_id: catalogId, profile_id: profileId, assignment_reason: reason, assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    { onConflict: 'catalog_id' }
  );
  if (error) throw error;
}
