import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type UpdateDriverPayload = {
  driverId: string;
  name?: string;
  phone?: string;
  cityName?: string;
  serviceSettlements?: string[];
  vehicleInfo?: string;
  carNumber?: string;
  photoUrl?: string;
  password?: string;
  isActive?: boolean;
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

const normalizeSettlements = (values?: string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );

const normalizeAuthPhone = (value?: string) => {
  if (!value?.trim()) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (value.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error('Phone is invalid.');
};

const assertPayload = (payload: UpdateDriverPayload) => {
  if (!payload.driverId) throw new Error('Driver id is required.');
  if (payload.name !== undefined && payload.name.trim().length < 2) throw new Error('Driver name is too short.');
  if (payload.password !== undefined && payload.password.length > 0 && !isStrongPassword(payload.password)) {
    throw new Error('Password is too weak.');
  }
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

    const payload = (await request.json()) as UpdateDriverPayload;
    if (payload.name !== undefined) payload.name = payload.name.trim();
    if (payload.phone !== undefined) payload.phone = payload.phone.trim();
    if (payload.cityName !== undefined) payload.cityName = payload.cityName.trim();
    if (payload.vehicleInfo !== undefined) payload.vehicleInfo = payload.vehicleInfo.trim();
    if (payload.carNumber !== undefined) payload.carNumber = payload.carNumber.trim();
    if (payload.photoUrl !== undefined) payload.photoUrl = payload.photoUrl.trim();
    if (payload.serviceSettlements !== undefined) payload.serviceSettlements = normalizeSettlements(payload.serviceSettlements);
    assertPayload(payload);
    const authPhone = payload.phone !== undefined ? normalizeAuthPhone(payload.phone) : undefined;

    const { data: currentDriver, error: currentDriverError } = await adminClient
      .from('drivers')
      .select('id, user_id, name')
      .eq('id', payload.driverId)
      .single();
    if (currentDriverError || !currentDriver) throw currentDriverError ?? new Error('Driver not found.');

    const { data: currentUser, error: currentUserError } = await adminClient
      .from('users')
      .select('id, auth_user_id')
      .eq('id', currentDriver.user_id)
      .single();
    if (currentUserError || !currentUser) throw currentUserError ?? new Error('Driver user not found.');

    const authUpdates: {
      password?: string;
      phone?: string;
      phone_confirm?: boolean;
      user_metadata?: Record<string, string>;
    } = {};
    if (payload.password) authUpdates.password = payload.password;
    if (authPhone) {
      authUpdates.phone = authPhone;
      authUpdates.phone_confirm = true;
    }
    if (payload.password || payload.name !== undefined) {
      authUpdates.user_metadata = {
          full_name: payload.name ?? currentDriver.name ?? '',
          role: 'driver'
      };
    }
    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
        currentUser.auth_user_id,
        authUpdates
      );
      if (authUpdateError) throw authUpdateError;
    }

    const driverUpdates: Record<string, unknown> = {};
    if (payload.name !== undefined) driverUpdates.name = payload.name;
    if (payload.phone !== undefined) driverUpdates.phone = payload.phone;
    if (payload.cityName !== undefined) driverUpdates.city_name = payload.cityName;
    if (payload.serviceSettlements !== undefined) driverUpdates.service_settlements = payload.serviceSettlements;
    if (payload.vehicleInfo !== undefined) driverUpdates.vehicle_info = payload.vehicleInfo;
    if (payload.carNumber !== undefined) driverUpdates.car_number = payload.carNumber;
    if (payload.photoUrl !== undefined) driverUpdates.photo_url = payload.photoUrl;
    if (payload.isActive !== undefined) driverUpdates.is_active = payload.isActive;

    if (Object.keys(driverUpdates).length > 0) {
      const { error: driverUpdateError } = await adminClient
        .from('drivers')
        .update(driverUpdates)
        .eq('id', payload.driverId);
      if (driverUpdateError) throw driverUpdateError;
    }

    const userUpdates: Record<string, unknown> = {};
    if (payload.name !== undefined) userUpdates.name = payload.name;
    if (payload.phone !== undefined) userUpdates.phone = payload.phone;
    if (Object.keys(userUpdates).length > 0) {
      const { error: publicUserUpdateError } = await adminClient
        .from('users')
        .update(userUpdates)
        .eq('id', currentUser.id);
      if (publicUserUpdateError) throw publicUserUpdateError;
    }

    return jsonResponse({ driverId: payload.driverId });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 400);
  }
});
