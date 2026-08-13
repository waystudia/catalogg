import type { Session } from '@supabase/supabase-js';
import {
  preserveSupabaseSessionForRedirect,
  signInWithPasswordResilient,
  supabase
} from '../supabase';
import { loginClientAccount, loginCurrentAuthClientAccount } from './clientAccountApi';
import { normalizeLoginPhone } from '../loginIdentifier';

export type StaffLoginRole = 'restaurant' | 'driver';

const PROFILE_CHECK_TIMEOUT_MS = 10_000;
const PROFILE_SERVICE_ERROR = 'Сервис профилей временно не отвечает. Повторите вход через несколько секунд.';

const isRestaurantRedirect = (redirect: string) =>
  redirect === '/admin' ||
  redirect === '/restaurant/activation' ||
  /^\/business\/[^/]+(?:\/|$)/.test(redirect) ||
  /^\/[^/]+\/dashboard(?:\/|$)/.test(redirect);

export const assertExpectedLoginRole = (redirect: string, expectedRole?: StaffLoginRole) => {
  if (!expectedRole) return;

  if (expectedRole === 'driver') {
    if (redirect === '/driver') return;
    if (isRestaurantRedirect(redirect)) {
      throw new Error('Это аккаунт ресторана. Выберите «Ресторан».');
    }
    throw new Error('Этот аккаунт не является водителем.');
  }

  if (isRestaurantRedirect(redirect)) return;
  if (redirect === '/driver') {
    throw new Error('Это аккаунт водителя. Выберите «Водитель».');
  }
  throw new Error('Этот аккаунт не привязан к ресторану.');
};

const settleProfileCheck = async <T>(request: PromiseLike<T>) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(PROFILE_SERVICE_ERROR)), PROFILE_CHECK_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const isMissingRedirectRpc = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  const errorText = `${String(value.code ?? '')} ${String(value.message ?? '')}`.toLowerCase();
  return (
    errorText.includes('pgrst202') ||
    (errorText.includes('resolve_current_login_redirect') &&
      (errorText.includes('not found') || errorText.includes('could not find')))
  );
};

type LoginCatalog = {
  slug?: string;
  business_type?: string | null;
};

const getClientCatalog = (client: { catalogs?: LoginCatalog | LoginCatalog[] | null } | null) => {
  const catalog = client?.catalogs;
  return Array.isArray(catalog) ? catalog[0] : catalog;
};

export const getCatalogWorkspaceRedirect = (catalog: LoginCatalog | null | undefined) => {
  const slug = catalog?.slug?.trim();
  if (!slug) return null;
  return catalog?.business_type === 'grocery'
    ? `/business/${slug}`
    : `/${slug}/dashboard`;
};

const normalizeCatalogWorkspaceRedirect = async (redirect: string) => {
  const match = /^\/([^/]+)\/dashboard(?:\/|$)/.exec(redirect);
  if (!match || !supabase) return redirect;

  const { data: catalog, error } = await supabase
    .from('catalogs')
    .select('slug, business_type')
    .eq('slug', decodeURIComponent(match[1]))
    .maybeSingle();

  if (error || !catalog) return redirect;
  return getCatalogWorkspaceRedirect(catalog) ?? redirect;
};

const metadataRole = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') return '';
  const role = (metadata as { role?: unknown }).role;
  return typeof role === 'string' ? role : '';
};

async function resolveSessionRedirectLegacy(user: Session['user'], emailFallback = '') {
  if (!supabase) return null;
  const normalizedEmail = user.email?.trim().toLowerCase() || emailFallback.trim().toLowerCase();

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
    .select('catalogs(slug, business_type)')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  const ownedRedirect = getCatalogWorkspaceRedirect(getClientCatalog(client));
  if (ownedRedirect) return ownedRedirect;

  if (normalizedEmail) {
    const { data: clientByEmail } = await supabase
      .from('clients')
      .select('catalogs(slug, business_type)')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const emailOwnedRedirect = getCatalogWorkspaceRedirect(getClientCatalog(clientByEmail));
    if (emailOwnedRedirect) return emailOwnedRedirect;
  }

  const { data: member } = await supabase
    .from('catalog_members')
    .select('catalogs(slug, business_type)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const memberRedirect = getCatalogWorkspaceRedirect(getClientCatalog(member));
  if (memberRedirect) return memberRedirect;

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin');
  if (isPlatformAdmin) return '/admin';

  return '/';
}

export async function resolveSessionRedirect(emailFallback = '', knownSession?: Session | null) {
  if (!supabase) return null;
  const session = knownSession ?? (await supabase.auth.getSession()).data.session;
  if (!session) return '/';

  const { data: redirect, error } = await settleProfileCheck(
    supabase.rpc('resolve_current_login_redirect')
  );
  if (!error && typeof redirect === 'string' && redirect.startsWith('/')) {
    return settleProfileCheck(normalizeCatalogWorkspaceRedirect(redirect));
  }

  if (isMissingRedirectRpc(error)) {
    return settleProfileCheck(resolveSessionRedirectLegacy(session.user, emailFallback));
  }

  throw new Error(PROFILE_SERVICE_ERROR);
}

export async function resolveLoginRedirect(
  identifier: string,
  password: string,
  expectedRole?: StaffLoginRole
) {
  if (!supabase) {
    const redirect =
      identifier.trim().toLowerCase() === 'admin' && password.trim() === '1234'
        ? '/mangal/dashboard'
        : null;
    if (redirect) assertExpectedLoginRole(redirect, expectedRole);
    return redirect;
  }

  const { data, error } = await signInWithPasswordResilient(identifier, password);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('invalid login credentials')) {
      throw new Error('Неверный телефон, email или пароль.');
    }
    if (
      message.includes('timeout') ||
      message.includes('deadline') ||
      message.includes('fetch') ||
      message.includes('abort') ||
      message.includes('signal') ||
      message.includes('temporarily') ||
      message.includes('медленно')
    ) {
      throw new Error('Сервис входа временно отвечает медленно. Нажмите «Войти» ещё раз.');
    }
    throw new Error(error.message);
  }

  const redirect = await resolveSessionRedirect(identifier.includes('@') ? identifier : '', data.session);
  if (redirect) assertExpectedLoginRole(redirect, expectedRole);
  if (redirect) {
    preserveSupabaseSessionForRedirect(redirect);
  }
  return redirect;
}

const isCredentialError = (error: unknown) =>
  error instanceof Error && /неверн|invalid login credentials/i.test(error.message);

export async function resolveUnifiedLogin(identifier: string, password: string) {
  const normalizedIdentifier = identifier.trim();
  const usesEmail = normalizedIdentifier.includes('@');

  try {
    const redirect = await resolveLoginRedirect(normalizedIdentifier, password);
    if (redirect && redirect !== '/') {
      if (redirect === '/profile') await loginCurrentAuthClientAccount();
      return redirect;
    }
  } catch (error) {
    if (usesEmail || !isCredentialError(error)) throw error;
  }

  if (usesEmail) {
    throw new Error('Аккаунт не привязан к WayYaam.');
  }

  try {
    await supabase?.auth.signOut({ scope: 'local' });
    await loginClientAccount({ phone: normalizeLoginPhone(normalizedIdentifier), password });
    return '/profile';
  } catch (error) {
    if (isCredentialError(error)) {
      throw new Error('Неверный телефон, email или пароль.');
    }
    throw error;
  }
}
