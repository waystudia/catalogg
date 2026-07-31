import type { Session } from '@supabase/supabase-js';
import {
  preserveSupabaseSessionForRedirect,
  signInWithPasswordResilient,
  supabase
} from '../supabase';
import { copySupabaseSessionToScope, getSupabaseAuthScope } from '../supabaseAuthScope';
import { getAuthenticatedDriverId } from './deliveryApi';

const getClientCatalogSlug = (client: { catalogs?: { slug?: string } | { slug?: string }[] | null } | null) => {
  const catalog = client?.catalogs;
  return Array.isArray(catalog) ? catalog[0]?.slug : catalog?.slug;
};

const metadataRole = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') return '';
  const role = (metadata as { role?: unknown }).role;
  return typeof role === 'string' ? role : '';
};

async function resolveSessionRedirectLegacy(user: Session['user'], emailFallback = '') {
  if (!supabase) return null;
  const normalizedEmail = user.email?.trim().toLowerCase() || emailFallback.trim().toLowerCase();

  const authenticatedDriverId = await getAuthenticatedDriverId();
  if (authenticatedDriverId) return '/driver';

  const { data: platformUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (platformUser?.role === 'driver') return '/driver';

  const { data: platformUserByEmail } = await supabase
    .from('users')
    .select('role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (platformUserByEmail?.role === 'driver' || metadataRole(user.user_metadata) === 'driver') {
    return '/driver';
  }

  const { data: client } = await supabase
    .from('clients')
    .select('catalogs(slug)')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  const ownedSlug = getClientCatalogSlug(client);
  if (ownedSlug) return `/${ownedSlug}/dashboard`;

  if (normalizedEmail) {
    const { data: clientByEmail } = await supabase
      .from('clients')
      .select('catalogs(slug)')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const emailOwnedSlug = getClientCatalogSlug(clientByEmail);
    if (emailOwnedSlug) return `/${emailOwnedSlug}/dashboard`;
  }

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

export async function resolveSessionRedirect(emailFallback = '', knownSession?: Session | null) {
  if (!supabase) return null;
  const session = knownSession ?? (await supabase.auth.getSession()).data.session;
  if (!session) return '/';

  const { data: redirect, error } = await supabase.rpc('resolve_current_login_redirect');
  if (!error && typeof redirect === 'string' && redirect.startsWith('/')) return redirect;

  return resolveSessionRedirectLegacy(session.user, emailFallback);
}

export async function resolveLoginRedirect(email: string, password: string) {
  if (!supabase) {
    return email.trim().toLowerCase() === 'admin' && password.trim() === '1234' ? '/mangal/dashboard' : null;
  }

  const { data, error } = await signInWithPasswordResilient(email, password);
  if (error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('deadline') ||
      message.includes('fetch') ||
      message.includes('temporarily') ||
      message.includes('медленно')
    ) {
      throw new Error('Сервис входа временно отвечает медленно. Нажмите «Войти» ещё раз.');
    }
    throw new Error(error.message);
  }

  const redirect = await resolveSessionRedirect(email, data.session);
  if (redirect) {
    preserveSupabaseSessionForRedirect(redirect);
    copySupabaseSessionToScope(getSupabaseAuthScope(redirect));
  }
  return redirect;
}
