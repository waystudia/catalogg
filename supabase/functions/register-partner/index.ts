import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type PartnerPayload = {
  role: 'seller' | 'driver';
  name: string;
  phone: string;
  email: string;
  password: string;
  businessType?: string;
  businessName?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  residencePlace?: string;
  transportType?: 'car' | 'van' | 'motorcycle';
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  carNumber?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (value.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error('phone_invalid');
};

const assertPayload = (payload: PartnerPayload) => {
  if (!['seller', 'driver'].includes(payload.role)) throw new Error('role_invalid');
  if (!payload.name?.trim() || payload.name.trim().length < 2) throw new Error('name_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email ?? '')) throw new Error('email_invalid');
  if ((payload.password ?? '').length < 8 || payload.password.length > 72) throw new Error('password_invalid');
  if (payload.role === 'seller' && !payload.businessName?.trim()) throw new Error('business_name_required');
  if (payload.role === 'driver' && (!payload.primaryCity?.trim() || !payload.residencePlace?.trim())) {
    throw new Error('driver_geography_required');
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('CATALOGG_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: 'service_not_configured' }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let createdUserId = '';
  try {
    const payload = await request.json() as PartnerPayload;
    assertPayload(payload);
    payload.email = payload.email.trim().toLowerCase();
    payload.phone = normalizePhone(payload.phone);
    payload.name = payload.name.trim();

    const { data: createdUser, error: authError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.name, registration_role: payload.role }
    });
    if (authError || !createdUser.user) throw authError ?? new Error('auth_user_create_failed');
    createdUserId = createdUser.user.id;

    const { data: registration, error: registrationError } = await admin.rpc('create_self_service_partner', {
      requested_user_id: createdUserId,
      requested_email: payload.email,
      requested_payload: { ...payload, password: undefined }
    });
    if (registrationError) throw registrationError;

    const { data: session, error: loginError } = await admin.auth.signInWithPassword({
      email: payload.email,
      password: payload.password
    });
    if (loginError || !session.session) throw loginError ?? new Error('session_create_failed');

    return respond({
      registration,
      session: {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token
      }
    });
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    const message = error instanceof Error ? error.message : 'registration_failed';
    return respond({ error: message }, 400);
  }
});
