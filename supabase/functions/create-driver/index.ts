import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type CreateDriverPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
  cityName?: string;
  vehicleInfo?: string;
  carNumber?: string;
  photoUrl?: string;
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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) return parts.join(' ');
  }
  return 'Unknown error';
};

const isStrongPassword = (value: string) =>
  value.length >= 10 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /\d/.test(value) &&
  /[!@#$%&*+\-_]/.test(value);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'city';

const assertPayload = (payload: CreateDriverPayload) => {
  if (!payload.name?.trim() || payload.name.trim().length < 2) throw new Error('Driver name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Email is invalid.');
  if (!isStrongPassword(payload.password)) throw new Error('Password is too weak.');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('CATALOGG_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase function secrets are not configured.' }, 500);
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: isPlatformAdmin, error: adminCheckError } = await userClient.rpc('is_platform_admin');
    if (adminCheckError || !isPlatformAdmin) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const payload = (await request.json()) as CreateDriverPayload;
    payload.name = payload.name.trim();
    payload.email = payload.email.trim().toLowerCase();
    payload.phone = payload.phone?.trim();
    payload.cityName = payload.cityName?.trim();
    payload.vehicleInfo = payload.vehicleInfo?.trim();
    payload.carNumber = payload.carNumber?.trim();
    payload.photoUrl = payload.photoUrl?.trim();
    assertPayload(payload);

    const { data: existingUser, error: existingUserError } = await adminClient
      .from('users')
      .select('id')
      .eq('email', payload.email)
      .maybeSingle();
    if (existingUserError) throw existingUserError;
    if (existingUser) throw new Error('Email already exists.');

    const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.name,
        role: 'driver'
      }
    });
    if (createAuthError || !createdAuthUser.user) {
      throw createAuthError ?? new Error('Could not create auth user.');
    }

    const authUserId = createdAuthUser.user.id;
    let publicUserId: string | null = null;
    let driverId: string | null = null;

    try {
      let cityId: string | null = null;
      if (payload.cityName) {
        const citySlug = slugify(payload.cityName);
        const { data: city, error: cityError } = await adminClient
          .from('cities')
          .upsert({ slug: citySlug, name: payload.cityName, is_active: true }, { onConflict: 'slug' })
          .select('id')
          .single();
        if (cityError || !city) throw cityError ?? new Error('Could not create city.');
        cityId = city.id;
      }

      const { data: publicUser, error: publicUserError } = await adminClient
        .from('users')
        .insert({
          auth_user_id: authUserId,
          role: 'driver',
          name: payload.name,
          phone: payload.phone ?? '',
          email: payload.email
        })
        .select('id')
        .single();
      if (publicUserError || !publicUser) throw publicUserError ?? new Error('Could not create driver user.');
      publicUserId = publicUser.id;

      const { data: driver, error: driverError } = await adminClient
        .from('drivers')
        .insert({
          user_id: publicUser.id,
          name: payload.name,
          phone: payload.phone ?? '',
          city_id: cityId,
          vehicle_info: payload.vehicleInfo ?? '',
          car_number: payload.carNumber ?? '',
          photo_url: payload.photoUrl ?? '',
          is_active: true,
          is_online: false,
          status: 'offline'
        })
        .select('id')
        .single();
      if (driverError || !driver) throw driverError ?? new Error('Could not create driver profile.');
      driverId = driver.id;

      return jsonResponse({
        driverId: driver.id,
        userId: publicUser.id,
        email: payload.email
      });
    } catch (error) {
      if (driverId) {
        await adminClient.from('drivers').delete().eq('id', driverId);
      }
      if (publicUserId) {
        await adminClient.from('users').delete().eq('id', publicUserId);
      }
      await adminClient.auth.admin.deleteUser(authUserId);
      throw error;
    }
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 400);
  }
});
