import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type DeletePlatformUserPayload = {
  kind?: 'restaurant' | 'driver' | 'client';
  id?: string;
  confirmed?: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Не удалось удалить пользователя.';
};

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

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: isPlatformAdmin, error: adminCheckError } = await userClient.rpc('is_platform_admin');
    if (adminCheckError || !isPlatformAdmin) return jsonResponse({ error: 'Forbidden' }, 403);

    const payload = (await request.json()) as DeletePlatformUserPayload;
    if (!payload.confirmed || !payload.kind || !payload.id) throw new Error('Удаление не подтверждено.');
    const kind = payload.kind;
    const targetId = payload.id;
    let targetAuthUserId = '';

    if (kind === 'restaurant') {
      const { data: client, error } = await adminClient
        .from('clients')
        .select('id, owner_user_id, catalog_id')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      if (!client) throw new Error('Ресторан не найден.');
      targetAuthUserId = client.owner_user_id;

      if (targetAuthUserId === userData.user.id) throw new Error('Нельзя удалить собственный аккаунт суперадмина.');
      const { data: protectedAdmin } = await adminClient.from('platform_admins').select('user_id').eq('user_id', targetAuthUserId).maybeSingle();
      if (protectedAdmin) throw new Error('Нельзя удалить аккаунт суперадмина.');

      const { error: authError } = await adminClient.auth.admin.deleteUser(targetAuthUserId, true);
      if (authError) throw authError;
      const { error: memberError } = await adminClient.from('catalog_members').delete().eq('catalog_id', client.catalog_id).eq('user_id', targetAuthUserId);
      if (memberError) throw memberError;
      const { error: profileError } = await adminClient.from('profiles').delete().eq('id', targetAuthUserId);
      if (profileError) throw profileError;
      const { error: clientError } = await adminClient.from('clients').delete().eq('id', client.id);
      if (clientError) throw clientError;
    }

    if (kind === 'driver') {
      const { data: driver, error } = await adminClient
        .from('drivers')
        .select('id, user_id')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw error;
      if (!driver) throw new Error('Водитель не найден.');

      const { data: publicUser, error: publicUserError } = driver.user_id
        ? await adminClient.from('users').select('id, auth_user_id, role').eq('id', driver.user_id).maybeSingle()
        : { data: null, error: null };
      if (publicUserError) throw publicUserError;
      targetAuthUserId = publicUser?.auth_user_id ?? driver.user_id ?? '';
      if (!targetAuthUserId) throw new Error('Аккаунт водителя не привязан к авторизации.');
      if (targetAuthUserId === userData.user.id) throw new Error('Нельзя удалить собственный аккаунт суперадмина.');

      const { error: authError } = await adminClient.auth.admin.deleteUser(targetAuthUserId, true);
      if (authError) throw authError;
      const { error: driverError } = await adminClient.from('drivers').update({ is_active: false, is_online: false, status: 'deleted', user_id: null }).eq('id', driver.id);
      if (driverError) throw driverError;
      if (publicUser?.id) {
        const { error: deleteUserError } = await adminClient.from('users').delete().eq('id', publicUser.id);
        if (deleteUserError) throw deleteUserError;
      }
    }

    if (kind === 'client') {
      if (targetId.startsWith('order-user-')) throw new Error('Исторический клиент заказа не является аккаунтом и не может быть удалён.');

      if (targetId.startsWith('profile-')) {
        targetAuthUserId = targetId.slice('profile-'.length);
        const { data: profile, error } = await adminClient.from('profiles').select('id').eq('id', targetAuthUserId).maybeSingle();
        if (error) throw error;
        if (!profile) throw new Error('Клиент не найден.');
      } else {
        const { data: signup, error: signupError } = await adminClient.from('client_signups').select('id').eq('id', targetId).maybeSingle();
        if (signupError) throw signupError;
        if (signup) {
          const { error: deleteSignupError } = await adminClient.from('client_signups').delete().eq('id', signup.id);
          if (deleteSignupError) throw deleteSignupError;
          return jsonResponse({ deleted: true });
        }

        const { data: publicUser, error: publicUserError } = await adminClient
          .from('users')
          .select('id, auth_user_id, role')
          .eq('id', targetId)
          .eq('role', 'client')
          .maybeSingle();
        if (publicUserError) throw publicUserError;
        if (!publicUser?.auth_user_id) throw new Error('Клиент не найден.');
        targetAuthUserId = publicUser.auth_user_id;
      }

      if (targetAuthUserId === userData.user.id) throw new Error('Нельзя удалить собственный аккаунт суперадмина.');
      const { data: linkedPublicUser, error: linkedPublicUserError } = await adminClient
        .from('users')
        .select('id, role')
        .eq('auth_user_id', targetAuthUserId)
        .maybeSingle();
      if (linkedPublicUserError) throw linkedPublicUserError;
      if (linkedPublicUser?.role && linkedPublicUser.role !== 'client') {
        throw new Error(linkedPublicUser.role === 'driver'
          ? 'Этот пользователь является водителем. Удалите его в группе «Водители».'
          : 'Этот пользователь относится к другой группе аккаунтов.');
      }
      const [{ data: protectedAdmin }, { data: restaurantOwner }, { data: driverOwner }] = await Promise.all([
        adminClient.from('platform_admins').select('user_id').eq('user_id', targetAuthUserId).maybeSingle(),
        adminClient.from('clients').select('id').eq('owner_user_id', targetAuthUserId).maybeSingle(),
        adminClient.from('drivers').select('id').eq('user_id', linkedPublicUser?.id ?? targetAuthUserId).maybeSingle()
      ]);
      if (protectedAdmin) throw new Error('Нельзя удалить аккаунт суперадмина.');
      if (restaurantOwner) throw new Error('Этот пользователь является владельцем ресторана. Удалите его в группе «Рестораны».');
      if (driverOwner) throw new Error('Этот пользователь является водителем. Удалите его в группе «Водители».');

      const { error: authError } = await adminClient.auth.admin.deleteUser(targetAuthUserId, true);
      if (authError) throw authError;
      const { error: profileError } = await adminClient.from('profiles').delete().eq('id', targetAuthUserId);
      if (profileError) throw profileError;
      const { error: publicUserDeleteError } = await adminClient.from('users').delete().eq('auth_user_id', targetAuthUserId).eq('role', 'client');
      if (publicUserDeleteError) throw publicUserDeleteError;
    }

    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 400);
  }
});
