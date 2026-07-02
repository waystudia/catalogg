import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type UpdateClientPayload = {
  clientId: string;
  companyName?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  password?: string;
  status?: 'active' | 'inactive' | 'blocked' | 'pending';
  planId?: string;
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';
  subscriptionEndsAt?: string | null;
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

const assertPayload = (payload: UpdateClientPayload) => {
  if (!payload.clientId) throw new Error('Client id is required.');
  if (payload.companyName !== undefined && payload.companyName.trim().length < 2) {
    throw new Error('Client name is too short.');
  }
  if (payload.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error('Email is invalid.');
  }
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

    const payload = (await request.json()) as UpdateClientPayload;
    if (payload.email) payload.email = payload.email.trim().toLowerCase();
    if (payload.companyName) payload.companyName = payload.companyName.trim();
    if (payload.ownerName) payload.ownerName = payload.ownerName.trim();
    if (payload.phone !== undefined) payload.phone = payload.phone.trim();
    if (payload.primaryCity !== undefined) payload.primaryCity = payload.primaryCity.trim();
    if (payload.serviceSettlements !== undefined) payload.serviceSettlements = normalizeSettlements(payload.serviceSettlements);
    assertPayload(payload);

    const { data: currentClient, error: currentClientError } = await adminClient
      .from('clients')
      .select('id, owner_user_id, catalog_id, email, company_name')
      .eq('id', payload.clientId)
      .single();
    if (currentClientError || !currentClient) throw currentClientError ?? new Error('Client not found.');

    if (payload.email && payload.email !== currentClient.email) {
      const { data: existingEmail, error: existingEmailError } = await adminClient
        .from('clients')
        .select('id')
        .eq('email', payload.email)
        .neq('id', payload.clientId)
        .maybeSingle();
      if (existingEmailError) throw existingEmailError;
      if (existingEmail) throw new Error('Email already exists.');
    }

    const authUpdates: { email?: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, string> } = {};
    if (payload.email && payload.email !== currentClient.email) {
      authUpdates.email = payload.email;
      authUpdates.email_confirm = true;
    }
    if (payload.password) {
      authUpdates.password = payload.password;
    }
    if (payload.ownerName !== undefined || payload.companyName !== undefined) {
      authUpdates.user_metadata = {
        full_name: payload.ownerName ?? '',
        company_name: payload.companyName ?? currentClient.company_name
      };
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
        currentClient.owner_user_id,
        authUpdates
      );
      if (authUpdateError) throw authUpdateError;
    }

    const clientUpdates: Record<string, unknown> = {};
    if (payload.companyName !== undefined) clientUpdates.company_name = payload.companyName;
    if (payload.ownerName !== undefined) clientUpdates.owner_name = payload.ownerName;
    if (payload.email !== undefined) clientUpdates.email = payload.email;
    if (payload.phone !== undefined) clientUpdates.phone = payload.phone;
    if (payload.primaryCity !== undefined) clientUpdates.primary_city = payload.primaryCity;
    if (payload.serviceSettlements !== undefined) clientUpdates.service_settlements = payload.serviceSettlements;
    if (payload.status !== undefined) clientUpdates.status = payload.status;
    if (payload.planId !== undefined) clientUpdates.plan_code = payload.planId;
    if (payload.subscriptionStatus !== undefined) clientUpdates.subscription_status = payload.subscriptionStatus;
    if (payload.subscriptionEndsAt !== undefined) clientUpdates.subscription_ends_at = payload.subscriptionEndsAt || null;

    if (Object.keys(clientUpdates).length > 0) {
      const { error: clientUpdateError } = await adminClient
        .from('clients')
        .update(clientUpdates)
        .eq('id', payload.clientId);
      if (clientUpdateError) throw clientUpdateError;
    }

    if (payload.companyName !== undefined || payload.status !== undefined) {
      const catalogUpdates: Record<string, unknown> = {};
      if (payload.companyName !== undefined) catalogUpdates.name = payload.companyName;
      if (payload.status !== undefined) {
        catalogUpdates.status = payload.status === 'blocked' || payload.status === 'inactive' ? 'draft' : 'published';
      }
      const { error: catalogUpdateError } = await adminClient
        .from('catalogs')
        .update(catalogUpdates)
        .eq('id', currentClient.catalog_id);
      if (catalogUpdateError) throw catalogUpdateError;
    }

    if (payload.primaryCity !== undefined || payload.serviceSettlements !== undefined) {
      const { data: currentDeliverySettings, error: currentDeliverySettingsError } = await adminClient
        .from('restaurant_delivery_settings')
        .select('primary_city, service_settlements')
        .eq('catalog_id', currentClient.catalog_id)
        .maybeSingle();
      if (currentDeliverySettingsError) throw currentDeliverySettingsError;

      const nextSettlements = payload.serviceSettlements ?? currentDeliverySettings?.service_settlements ?? [];
      const nextPrimaryCity = payload.primaryCity ?? currentDeliverySettings?.primary_city ?? '';
      const { error: deliverySettingsError } = await adminClient.from('restaurant_delivery_settings').upsert(
        {
          catalog_id: currentClient.catalog_id,
          delivery_area_mode: nextSettlements.length > 0 ? 'settlements' : 'radius',
          primary_city: nextPrimaryCity,
          service_settlements: nextSettlements
        },
        { onConflict: 'catalog_id' }
      );
      if (deliverySettingsError) throw deliverySettingsError;
    }

    if (
      payload.planId !== undefined ||
      payload.subscriptionStatus !== undefined ||
      payload.subscriptionEndsAt !== undefined
    ) {
      const subscriptionUpdates: Record<string, unknown> = {};
      if (payload.planId !== undefined) subscriptionUpdates.plan_code = payload.planId;
      if (payload.subscriptionStatus !== undefined) subscriptionUpdates.status = payload.subscriptionStatus;
      if (payload.subscriptionEndsAt !== undefined) subscriptionUpdates.ends_at = payload.subscriptionEndsAt || null;
      const { error: subscriptionError } = await adminClient
        .from('client_subscriptions')
        .update(subscriptionUpdates)
        .eq('client_id', payload.clientId);
      if (subscriptionError) throw subscriptionError;
    }

    if (payload.email !== undefined || payload.ownerName !== undefined) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({
          email: payload.email ?? currentClient.email,
          full_name: payload.ownerName ?? ''
        })
        .eq('id', currentClient.owner_user_id);
      if (profileError) throw profileError;
    }

    await adminClient.from('audit_logs').insert({
      catalog_id: currentClient.catalog_id,
      actor_id: userData.user.id,
      action: 'client.updated',
      entity_table: 'clients',
      entity_id: payload.clientId,
      payload: {
        actor_email: userData.user.email,
        changed_email: payload.email !== undefined,
        changed_password: Boolean(payload.password),
        changed_subscription: payload.subscriptionStatus !== undefined || payload.subscriptionEndsAt !== undefined
      }
    });

    return jsonResponse({
      clientId: payload.clientId,
      email: payload.email ?? currentClient.email
    });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 400);
  }
});
