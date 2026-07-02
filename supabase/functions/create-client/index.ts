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

const assertPayload = (payload: CreateClientPayload) => {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!payload.name?.trim() || payload.name.trim().length < 2) throw new Error('Client name is required.');
  if (!slugPattern.test(payload.slug) || payload.slug.length < 3 || payload.slug.length > 63) {
    throw new Error('Slug is invalid.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Email is invalid.');
  if (!isStrongPassword(payload.password)) throw new Error('Password is too weak.');
  if (!payload.templateVersionId) throw new Error('Template is required.');
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

    const [
      { data: existingClientByEmail, error: existingClientError },
      { data: existingCatalogBySlug, error: existingCatalogError },
      { data: templateCatalog, error: templateCatalogError }
    ] =
      await Promise.all([
        adminClient.from('clients').select('id').eq('email', payload.email).maybeSingle(),
        adminClient.from('catalogs').select('id').eq('slug', payload.slug).maybeSingle(),
        adminClient
          .from('catalogs')
          .select('id, template_version_id, is_template')
          .eq('id', payload.templateVersionId)
          .eq('is_template', true)
          .maybeSingle()
      ]);

    if (existingClientError) throw existingClientError;
    if (existingCatalogError) throw existingCatalogError;
    if (templateCatalogError) throw templateCatalogError;
    if (existingClientByEmail) throw new Error('Email already exists.');
    if (existingCatalogBySlug) throw new Error('Slug already exists.');
    if (!templateCatalog) throw new Error('Template catalog is not available.');

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: payload.email,
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
    let catalogId: string | null = null;
    let clientId: string | null = null;

    try {
      const { error: actorProfileError } = await adminClient.from('profiles').upsert({
        id: userData.user.id,
        email: userData.user.email ?? '',
        full_name: userData.user.user_metadata?.full_name ?? ''
      });
      if (actorProfileError) throw actorProfileError;

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: ownerUserId,
        email: payload.email,
        full_name: payload.ownerName ?? ''
      });
      if (profileError) throw profileError;

      const { data: createdCatalogId, error: catalogError } = await adminClient.rpc('create_restaurant_from_template', {
        template_id: payload.templateVersionId,
        new_restaurant_name: payload.name,
        new_restaurant_slug: payload.slug,
        new_template_version_id: (templateCatalog as { template_version_id?: string }).template_version_id ?? null,
        created_by_user_id: userData.user.id
      });
      if (catalogError || !createdCatalogId) throw catalogError ?? new Error('Could not create catalog from template.');
      catalogId = String(createdCatalogId);

      const nextCatalogStatus = payload.status === 'inactive' || payload.status === 'blocked' ? 'draft' : 'published';
      const { data: catalog, error: catalogFetchError } = await adminClient
        .from('catalogs')
        .update({ status: nextCatalogStatus })
        .eq('id', catalogId)
        .select('id, slug')
        .single();
      if (catalogFetchError || !catalog) throw catalogFetchError ?? new Error('Could not load created catalog.');

      const { error: memberError } = await adminClient.from('catalog_members').insert({
        catalog_id: catalog.id,
        user_id: ownerUserId,
        role: 'owner'
      });
      if (memberError) throw memberError;

      if (payload.primaryCity || payload.serviceSettlements.length > 0) {
        const { error: deliverySettingsError } = await adminClient.from('restaurant_delivery_settings').upsert(
          {
            catalog_id: catalog.id,
            delivery_area_mode: payload.serviceSettlements.length > 0 ? 'settlements' : 'radius',
            primary_city: payload.primaryCity ?? '',
            service_settlements: payload.serviceSettlements
          },
          { onConflict: 'catalog_id' }
        );
        if (deliverySettingsError) throw deliverySettingsError;
      }

      const { data: client, error: clientError } = await adminClient
        .from('clients')
        .insert({
          owner_user_id: ownerUserId,
          catalog_id: catalog.id,
          company_name: payload.name,
          owner_name: payload.ownerName ?? '',
          email: payload.email,
          phone: payload.phone ?? '',
          primary_city: payload.primaryCity ?? '',
          service_settlements: payload.serviceSettlements,
          status: payload.status ?? 'active',
          plan_code: payload.planId ?? 'trial',
          subscription_status: payload.subscriptionStatus ?? 'trial',
          subscription_ends_at: payload.subscriptionEndsAt || null,
          first_login: true,
          consent_given: false,
          consent_source: null,
          admin_consent_confirmed: true,
          admin_consent_confirmed_at: new Date().toISOString(),
          admin_consent_actor_id: userData.user.id,
          created_by: userData.user.id
        })
        .select('id')
        .single();
      if (clientError || !client) throw clientError ?? new Error('Could not create client.');
      clientId = client.id;

      const { error: subscriptionError } = await adminClient.from('client_subscriptions').insert({
        client_id: client.id,
        plan_code: payload.planId ?? 'trial',
        status: payload.subscriptionStatus ?? 'trial',
        started_at: new Date().toISOString(),
        ends_at: payload.subscriptionEndsAt || null
      });
      if (subscriptionError) throw subscriptionError;

      const { error: auditError } = await adminClient.from('audit_logs').insert({
        catalog_id: catalog.id,
        actor_id: userData.user.id,
        action: 'client.created',
        entity_table: 'clients',
        entity_id: client.id,
        payload: {
          client_name: payload.name,
          actor_email: userData.user.email,
          owner_email: payload.email
        }
      });
      if (auditError) throw auditError;

      return jsonResponse({
        clientId: client.id,
        catalogId: catalog.id,
        slug: catalog.slug,
        email: payload.email
      });
    } catch (error) {
      if (clientId) {
        await adminClient.from('clients').delete().eq('id', clientId);
      }
      if (catalogId) {
        await adminClient.from('catalogs').delete().eq('id', catalogId);
      }
      await adminClient.auth.admin.deleteUser(ownerUserId);
      throw error;
    }
  } catch (error) {
    const message = getErrorMessage(error);
    return jsonResponse({ error: message }, 400);
  }
});
