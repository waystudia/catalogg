import { supabase } from '../supabase';

export type PlatformAdminAccess = {
  hasSession: boolean;
  isPlatformAdmin: boolean;
  email: string | null;
};

export async function getPlatformAdminAccess(): Promise<PlatformAdminAccess> {
  if (!supabase) {
    return {
      hasSession: true,
      isPlatformAdmin: true,
      email: 'local@catalog.app'
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    return {
      hasSession: false,
      isPlatformAdmin: false,
      email: null
    };
  }

  const { data, error } = await supabase.rpc('is_platform_admin');
  return {
    hasSession: true,
    isPlatformAdmin: !error && Boolean(data),
    email: session.user.email ?? null
  };
}

export async function signInPlatformAdmin(email: string, password: string) {
  if (!supabase) return getPlatformAdminAccess();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) throw new Error(error.message);

  return getPlatformAdminAccess();
}

export async function signOutPlatformAdmin() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
