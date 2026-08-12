import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type CreateClientPayload = {
  name: string;
  slug: string;
  ownerName?: string;
  email: string;
  phone?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  password: string;
  templateVersionId: string;
  businessType: string;
  templateType: string;
  seedDemoMenu?: boolean;
  planId?: string;
  subscriptionEndsAt?: string;
  status?: 'active' | 'inactive' | 'blocked' | 'pending';
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';
  adminConsentConfirmed?: boolean;
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

const assertPayload = (payload: CreateClientPayload) => {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!payload.name?.trim() || payload.name.trim().length < 2) throw new Error('Client name is required.');
  if (!slugPattern.test(payload.slug) || payload.slug.length < 3 || payload.slug.length > 63) {
    throw new Error('Slug is invalid.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Email is invalid.');
  if (!isStrongPassword(payload.password)) throw new Error('Password is too weak.');
  if (!payload.templateVersionId) throw new Error('Template is required.');
  if (!payload.businessType?.trim()) throw new Error('Business type is invalid.');
  if (payload.templateType !== payload.businessType) throw new Error('Template type does not match the business type.');
  if (!payload.adminConsentConfirmed) throw new Error('Client consent confirmation is required.');
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

    const payload = (await request.json()) as CreateClientPayload;
    payload.email = payload.email.trim().toLowerCase();
    payload.name = payload.name.trim();
    payload.slug = payload.slug.trim().toLowerCase();
    payload.ownerName = payload.ownerName?.trim();
    payload.phone = payload.phone?.trim();
    payload.primaryCity = payload.primaryCity?.trim();
    payload.serviceSettlements = normalizeSettlements(payload.serviceSettlements);
    assertPayload(payload);
    const authPhone = normalizeAuthPhone(payload.phone);

    const [
      { data: existingClientByEmail, error: existingClientError },
      { data: existingCatalogBySlug, error: existingCatalogError },
      { data: businessTypeData, error: businessTypeError },
      { data: templateCatalogData, error: templateCatalogError }
    ] =
      await Promise.all([
        adminClient.from('clients').select('id').eq('email', payload.email).maybeSingle(),
        adminClient.from('catalogs').select('id').eq('slug', payload.slug).maybeSingle(),
        adminClient
          .from('business_types')
          .select('code, availability')
          .eq('code', payload.businessType)
          .maybeSingle(),
        adminClient
          .from('catalogs')
          .select('id, is_template, business_type')
          .eq('id', payload.templateVersionId)
          .eq('is_template', true)
          .maybeSingle()
      ]);

    if (existingClientError) throw existingClientError;
    if (existingCatalogError) throw existingCatalogError;
    if (businessTypeError) throw businessTypeError;
    if (templateCatalogError) throw templateCatalogError;
    if (existingClientByEmail) throw new Error('Email already exists.');
    if (existingCatalogBySlug) throw new Error('Slug already exists.');

    const businessTypeRecord = businessTypeData && typeof businessTypeData === 'object'
      ? businessTypeData as { code?: unknown; availability?: unknown }
      : null;
    if (!businessTypeRecord || businessTypeRecord.code !== payload.businessType) {
      throw new Error('Business type is invalid.');
    }
    if (businessTypeRecord.availability !== 'active') {
      throw new Error('Business type is not available for onboarding.');
    }

    const templateCatalog = templateCatalogData && typeof templateCatalogData === 'object'
      ? templateCatalogData as { id?: unknown; business_type?: unknown }
      : null;
    if (!templateCatalog || templateCatalog.id !== payload.templateVersionId) {
      throw new Error('Template catalog is not available.');
    }
    if (templateCatalog.business_type !== payload.businessType) {
      throw new Error('Template type does not match the selected template.');
    }

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      ...(authPhone ? { phone: authPhone, phone_confirm: true } : {}),
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.ownerName ?? payload.name,
        company_name: payload.name
      }
    });
    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Could not create user.');
    }

    const ownerUserId = createdUser.user.id;
    const { data: onboardingResult, error: onboardingError } = await adminClient.rpc(
      'create_platform_business_from_template',
      {
        requested_template_id: payload.templateVersionId,
        requested_name: payload.name,
        requested_slug: payload.slug,
        requested_business_type: payload.businessType,
        requested_owner_user_id: ownerUserId,
        requested_owner_email: payload.email,
        requested_owner_name: payload.ownerName ?? '',
        requested_actor_user_id: userData.user.id,
        requested_actor_email: userData.user.email ?? '',
        requested_phone: payload.phone ?? '',
        requested_primary_city: payload.primaryCity ?? '',
        requested_service_settlements: payload.serviceSettlements,
        requested_seed_demo_menu: payload.seedDemoMenu === true,
        requested_plan_code: payload.planId ?? 'trial',
        requested_subscription_ends_at: payload.subscriptionEndsAt || null,
        requested_client_status: payload.status ?? 'active',
        requested_subscription_status: payload.subscriptionStatus ?? 'trial'
      }
    );

    if (onboardingError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(ownerUserId);
      if (cleanupError) {
        throw new Error(`${getErrorMessage(onboardingError)} Auth cleanup failed: ${getErrorMessage(cleanupError)}`);
      }
      throw onboardingError;
    }

    if (!onboardingResult || typeof onboardingResult !== 'object') {
      throw new Error('Onboarding transaction did not return client data.');
    }

    const result = onboardingResult as Record<string, unknown>;
    if (
      typeof result.clientId !== 'string' ||
      typeof result.catalogId !== 'string' ||
      typeof result.slug !== 'string' ||
      typeof result.email !== 'string'
    ) {
      throw new Error('Onboarding transaction returned invalid client data.');
    }

    return jsonResponse({
      clientId: result.clientId,
      catalogId: result.catalogId,
      slug: result.slug,
      email: result.email
    });
  } catch (error) {
    const message = getErrorMessage(error);
    return jsonResponse({ error: message }, 400);
  }
});
