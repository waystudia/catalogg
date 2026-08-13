import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type CreateCatalogStaffPayload = {
  catalogId: string;
  fullName: string;
  email: string;
  password: string;
  roleCode: 'manager' | 'picker';
  receivesNewOrders?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const message = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Unknown error';
};

const strongPassword = (value: string) =>
  value.length >= 10 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[!@#$%&*+\-_]/.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('CATALOGG_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let createdUserId: string | null = null;
  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const payload = (await request.json()) as CreateCatalogStaffPayload;
    payload.catalogId = payload.catalogId?.trim();
    payload.fullName = payload.fullName?.trim();
    payload.email = payload.email?.trim().toLowerCase();

    if (!/^[0-9a-f-]{36}$/i.test(payload.catalogId)) throw new Error('Catalog is invalid.');
    if (!payload.fullName || payload.fullName.length < 2) throw new Error('Staff name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Email is invalid.');
    if (!strongPassword(payload.password)) throw new Error('Password is too weak.');
    if (!['manager', 'picker'].includes(payload.roleCode)) throw new Error('Staff role is invalid.');

    const { data: canManage, error: canManageError } = await userClient.rpc('can_manage_catalog_team', {
      target_catalog_id: payload.catalogId
    });
    if (canManageError || canManage !== true) return jsonResponse({ error: 'Forbidden' }, 403);

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName, role: payload.roleCode }
    });
    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Could not create staff account.');
    }
    createdUserId = createdUser.user.id;

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: createdUserId,
      email: payload.email,
      full_name: payload.fullName
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { data: member, error: linkError } = await adminClient.rpc('link_catalog_staff_by_user_id', {
      target_catalog_id: payload.catalogId,
      target_user_id: createdUserId,
      target_role_code: payload.roleCode,
      target_receives_new_orders: payload.receivesNewOrders !== false,
      target_actor_user_id: userData.user.id
    });
    if (linkError) throw linkError;
    const row = Array.isArray(member) ? member[0] : member;
    if (!row) throw new Error('Could not link staff account.');
    return jsonResponse(row);
  } catch (error) {
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
    return jsonResponse({ error: message(error) }, 400);
  }
});
