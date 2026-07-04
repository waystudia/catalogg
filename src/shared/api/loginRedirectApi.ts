import { supabase } from '../supabase';

const getClientCatalogSlug = (client: { catalogs?: { slug?: string } | { slug?: string }[] | null } | null) => {
  const catalog = client?.catalogs;
  return Array.isArray(catalog) ? catalog[0]?.slug : catalog?.slug;
};

export async function resolveLoginRedirect(email: string, password: string) {
  if (!supabase) {
    return email.trim().toLowerCase() === 'admin' && password.trim() === '1234' ? '/mangal/dashboard' : null;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error) throw new Error(error.message);

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return '/';

  const { data: platformUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (platformUser?.role === 'driver') return '/driver';

  const { data: client } = await supabase
    .from('clients')
    .select('catalogs(slug)')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  const ownedSlug = getClientCatalogSlug(client);
  if (ownedSlug) return `/${ownedSlug}/dashboard`;

  const { data: member } = await supabase
    .from('catalog_members')
    .select('catalogs(slug)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const memberSlug = getClientCatalogSlug(member);
  if (memberSlug) return `/${memberSlug}/dashboard`;

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
  if (isPlatformAdmin) return '/admin';

  return '/';
}
