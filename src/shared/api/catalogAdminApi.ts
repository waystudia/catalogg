import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { copySupabaseSessionToScope } from '../supabaseAuthScope';
import { clearPwaResumePath } from '../pwaSession';
import type { SubscriptionStatus } from './platformTypes';

export type CatalogAdminAccess = {
  hasSession: boolean;
  isMember: boolean;
  email: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | null;
  firstLogin: boolean;
  consentGiven: boolean;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  catalog: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    description: string;
    logoUrl: string;
    templateName: string;
    templateVersion: number;
    businessType: string;
  } | null;
};

type CatalogRow = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  description: string | null;
  logo_url: string | null;
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
  businessType: row.template_versions?.templates?.business_type ?? 'catalog'
});

async function loadCatalogBySlug(slug: string) {
  if (!supabase) {
    return {
      id: `catalog-${slug}`,
      name: slug,
      slug,
      status: 'published' as const,
      description: '',
      logoUrl: '',
      templateName: 'Restaurant Modern',
      templateVersion: 1,
      businessType: 'restaurant'
    };
  }

  const { data, error } = await supabase
    .from('catalogs')
    .select('id, name, slug, status, description, logo_url, template_versions(version, templates(name, business_type))')
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
      email: 'client@catalog.app',
      role: 'owner',
      firstLogin: false,
      consentGiven: true,
      subscriptionStatus: 'active',
      subscriptionEndsAt: null,
      catalog
    };
  }

  const session = sessionResult;

  if (!session) {
    return {
      hasSession: false,
      isMember: false,
      email: null,
      role: null,
      firstLogin: false,
      consentGiven: false,
      subscriptionStatus: 'expired',
      subscriptionEndsAt: null,
      catalog
    };
  }

  if (!catalog) {
    return {
      hasSession: true,
      isMember: false,
      email: session.user.email ?? null,
      role: null,
      firstLogin: false,
      consentGiven: false,
      subscriptionStatus: 'expired',
      subscriptionEndsAt: null,
      catalog: null
    };
  }

  const [memberResult, clientResult] = await Promise.all([
    supabase
      .from('catalog_members')
      .select('role')
      .eq('catalog_id', catalog.id)
      .eq('user_id', session.user.id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('catalog_id, first_login, consent_given, subscription_status, subscription_ends_at')
      .eq('owner_user_id', session.user.id)
      .maybeSingle()
  ]);

  const { data: member, error } = memberResult;
  const { data: client, error: clientError } = clientResult;
  if (error) throw new Error(error.message);

  if (clientError) throw new Error(clientError.message);
  const clientOwnsCatalog = client?.catalog_id === catalog.id;

  return {
    hasSession: true,
    isMember: Boolean(member) || clientOwnsCatalog,
    email: session.user.email ?? null,
    role: (member?.role as CatalogRole | undefined) ?? (clientOwnsCatalog ? 'owner' : null),
    firstLogin: client?.first_login ?? false,
    consentGiven: client?.consent_given ?? true,
    subscriptionStatus: (client?.subscription_status as SubscriptionStatus | undefined) ?? 'active',
    subscriptionEndsAt: client?.subscription_ends_at ?? null,
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

export async function confirmPersonalDataConsent(slug: string): Promise<CatalogAdminAccess> {
  if (!supabase) {
    localStorage.setItem('waycatalog:demo-consent-given', 'true');
    return getCatalogAdminAccess(slug);
  }

  const { error } = await supabase.rpc('mark_client_personal_data_consent');
  if (error) throw new Error(error.message);
  return getCatalogAdminAccess(slug);
}
