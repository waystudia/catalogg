import { supabase } from '../supabase';

export type CatalogAdminAccess = {
  hasSession: boolean;
  isMember: boolean;
  email: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | null;
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
      id: 'local-catalog',
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

export async function getCatalogAdminAccess(slug: string): Promise<CatalogAdminAccess> {
  const catalog = await loadCatalogBySlug(slug);

  if (!supabase) {
    return {
      hasSession: true,
      isMember: true,
      email: 'client@catalog.app',
      role: 'owner',
      catalog
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    return {
      hasSession: false,
      isMember: false,
      email: null,
      role: null,
      catalog
    };
  }

  if (!catalog) {
    return {
      hasSession: true,
      isMember: false,
      email: session.user.email ?? null,
      role: null,
      catalog: null
    };
  }

  const { data: member, error } = await supabase
    .from('catalog_members')
    .select('role')
    .eq('catalog_id', catalog.id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    hasSession: true,
    isMember: Boolean(member),
    email: session.user.email ?? null,
    role: (member?.role as CatalogRole | undefined) ?? null,
    catalog
  };
}

export async function signInCatalogAdmin(slug: string, email: string, password: string) {
  if (!supabase) return getCatalogAdminAccess(slug);

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) throw new Error(error.message);
  return getCatalogAdminAccess(slug);
}

export async function signOutCatalogAdmin() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
