import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { copySupabaseSessionToScope } from '../supabaseAuthScope';
import { clearPwaResumePath } from '../pwaSession';
import { normalizeBusinessType, type BusinessType } from '../businessTerminology';
import type { SubscriptionStatus } from './platformTypes';
import type { CatalogStaffRole } from '../../entities/catalogStaff';

export type CatalogLegalActivationStatus =
  | 'draft'
  | 'configured'
  | 'awaiting_acceptance'
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'archived'
  | 'legacy_review_required'
  | 'reacceptance_required';

export type CatalogAdminAccess = {
  hasSession: boolean;
  isMember: boolean;
  userId: string | null;
  email: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | null;
  staffRole: CatalogStaffRole;
  firstLogin: boolean;
  consentGiven: boolean;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  legalActivationStatus: CatalogLegalActivationStatus | null;
  catalog: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    description: string;
    logoUrl: string;
    templateName: string;
    templateVersion: number;
    businessType: BusinessType;
  } | null;
};

type CatalogRow = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  description: string | null;
  logo_url: string | null;
  business_type: string | null;
  template_versions?: {
    version?: number;
    templates?: {
      name?: string;
      business_type?: string;
    } | null;
  } | null;
};

type CatalogRole = 'owner' | 'admin' | 'editor' | 'viewer';

const mapCatalog = (row: CatalogRow): NonNullable<CatalogAdminAccess['catalog']> => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  description: row.description ?? '',
  logoUrl: row.logo_url ?? '',
  templateName: row.template_versions?.templates?.name ?? 'Template',
  templateVersion: row.template_versions?.version ?? 1,
  businessType: normalizeBusinessType(row.business_type ?? row.template_versions?.templates?.business_type)
});

async function loadCatalogBySlug(slug: string) {
  if (!supabase) {
    const isGroceryDemo = slug.toLocaleLowerCase('ru-RU') === 'finik';
    return {
      id: `catalog-${slug}`,
      name: isGroceryDemo ? 'Финик' : slug,
      slug,
      status: 'published' as const,
      description: '',
      logoUrl: '',
      templateName: isGroceryDemo ? 'Grocery Universal' : 'Restaurant Modern',
      templateVersion: 1,
      businessType: normalizeBusinessType(isGroceryDemo ? 'grocery' : 'restaurant')
    };
  }

  const { data, error } = await supabase
    .from('catalogs')
    .select('id, name, slug, status, description, logo_url, business_type, template_versions(version, templates(name, business_type))')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapCatalog(data as CatalogRow);
}

export async function getCatalogAdminAccess(slug: string, knownSession?: Session | null): Promise<CatalogAdminAccess> {
  const [catalog, sessionResult] = await Promise.all([
    loadCatalogBySlug(slug),
    knownSession !== undefined || !supabase
      ? Promise.resolve(knownSession ?? null)
      : supabase.auth.getSession().then(({ data }) => data.session)
  ]);

  if (!supabase) {
    return {
      hasSession: true,
      isMember: true,
      userId: 'demo-owner',
      email: 'client@catalog.app',
      role: 'owner',
      staffRole: null,
      firstLogin: false,
      consentGiven: true,
      subscriptionStatus: 'active',
      subscriptionEndsAt: null,
      legalActivationStatus: 'active',
      catalog
    };
  }

  const session = sessionResult;

  if (!session) {
    return {
      hasSession: false,
      isMember: false,
      userId: null,
      email: null,
      role: null,
      staffRole: null,
      firstLogin: false,
      consentGiven: false,
      subscriptionStatus: 'expired',
      subscriptionEndsAt: null,
      legalActivationStatus: null,
      catalog
    };
  }

  if (!catalog) {
    return {
      hasSession: true,
      isMember: false,
      userId: session.user.id,
      email: session.user.email ?? null,
      role: null,
      staffRole: null,
      firstLogin: false,
      consentGiven: false,
      subscriptionStatus: 'expired',
      subscriptionEndsAt: null,
      legalActivationStatus: null,
      catalog: null
    };
  }

  const [memberResult, clientResult, staffResult] = await Promise.all([
    supabase
      .from('catalog_members')
      .select('role')
      .eq('catalog_id', catalog.id)
      .eq('user_id', session.user.id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('catalog_id, owner_user_id, first_login, consent_given, subscription_status, subscription_ends_at, legal_activation_status')
      .eq('catalog_id', catalog.id)
      .maybeSingle(),
    supabase
      .from('catalog_staff_memberships')
      .select('role_code, is_active')
      .eq('catalog_id', catalog.id)
      .eq('user_id', session.user.id)
      .maybeSingle()
  ]);

  const { data: member, error } = memberResult;
  const { data: client, error: clientError } = clientResult;
  const { data: staff, error: staffError } = staffResult;
  if (error) throw new Error(error.message);

  if (clientError) throw new Error(clientError.message);
  const staffTableMissing = staffError && ['42P01', 'PGRST200', 'PGRST205'].includes(staffError.code ?? '');
  if (staffError && !staffTableMissing) throw new Error(staffError.message);
  const clientOwnsCatalog = client?.catalog_id === catalog.id && client?.owner_user_id === session.user.id;
  const staffRole = staff?.is_active && ['manager', 'picker'].includes(staff.role_code)
    ? staff.role_code as Exclude<CatalogStaffRole, null>
    : null;

  return {
    hasSession: true,
    isMember: Boolean(member) || clientOwnsCatalog || Boolean(staffRole),
    userId: session.user.id,
    email: session.user.email ?? null,
    role: (member?.role as CatalogRole | undefined) ?? (clientOwnsCatalog ? 'owner' : null),
    staffRole,
    firstLogin: client?.first_login ?? false,
    consentGiven: client?.consent_given ?? true,
    subscriptionStatus: (client?.subscription_status as SubscriptionStatus | undefined) ?? 'active',
    subscriptionEndsAt: client?.subscription_ends_at ?? null,
    legalActivationStatus: (client?.legal_activation_status as CatalogLegalActivationStatus | undefined) ?? null,
    catalog
  };
}

export async function signInCatalogAdmin(slug: string, email: string, password: string) {
  if (!supabase) return getCatalogAdminAccess(slug);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) throw new Error(error.message);
  copySupabaseSessionToScope('restaurant-admin');
  return getCatalogAdminAccess(slug, data.session);
}

export async function signOutCatalogAdmin() {
  clearPwaResumePath();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function changeCatalogAdminPassword(newPassword: string) {
  const normalizedPassword = newPassword.trim();
  if (normalizedPassword.length < 10) {
    throw new Error('Пароль должен содержать минимум 10 символов');
  }
  if (!supabase) return;

  const { error } = await supabase.auth.updateUser({ password: normalizedPassword });
  if (error) throw new Error(error.message);
}

export async function confirmPersonalDataConsent(slug: string): Promise<CatalogAdminAccess> {
  if (!supabase) {
    localStorage.setItem('waycatalog:demo-consent-given', 'true');
    return getCatalogAdminAccess(slug);
  }

  const { error } = await supabase.rpc('mark_client_personal_data_consent');
  if (error) throw new Error(error.message);
  return getCatalogAdminAccess(slug);
}
