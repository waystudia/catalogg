import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

type CreateClientPayload = {
  name: string;
  slug: string;
  ownerName?: string;
  email: string;
  phone?: string;
  password: string;
  templateVersionId: string;
  businessType: string;
  planId?: string;
  subscriptionEndsAt?: string;
  status?: 'active' | 'inactive' | 'blocked' | 'pending';
  subscriptionStatus?: 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';
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

const isStrongPassword = (value: string) =>
  value.length >= 10 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /\d/.test(value) &&
  /[!@#$%&*+\-_]/.test(value);

const assertPayload = (payload: CreateClientPayload) => {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!payload.name?.trim() || payload.name.trim().length < 2) throw new Error('Client name is required.');
  if (!slugPattern.test(payload.slug) || payload.slug.length < 3 || payload.slug.length > 63) {
    throw new Error('Slug is invalid.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Email is invalid.');
  if (!isStrongPassword(payload.password)) throw new Error('Password is too weak.');
  if (!payload.templateVersionId) throw new Error('Template version is required.');
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
    assertPayload(payload);

    const [{ data: existingClientByEmail }, { data: existingCatalogBySlug }, { data: templateVersion }] =
      await Promise.all([
        adminClient.from('clients').select('id').eq('email', payload.email).maybeSingle(),
        adminClient.from('catalogs').select('id').eq('slug', payload.slug).maybeSingle(),
        adminClient
          .from('template_versions')
          .select('id, status')
          .eq('id', payload.templateVersionId)
          .eq('status', 'published')
          .maybeSingle()
      ]);

    if (existingClientByEmail) throw new Error('Email already exists.');
    if (existingCatalogBySlug) throw new Error('Slug already exists.');
    if (!templateVersion) throw new Error('Template version is not available.');

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
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: ownerUserId,
        email: payload.email,
        full_name: payload.ownerName ?? ''
      });
      if (profileError) throw profileError;

      const { data: catalog, error: catalogError } = await adminClient
        .from('catalogs')
        .insert({
          template_version_id: payload.templateVersionId,
          slug: payload.slug,
          name: payload.name,
          status: payload.status === 'inactive' || payload.status === 'blocked' ? 'draft' : 'published',
          created_by: userData.user.id
        })
        .select('id, slug')
        .single();
      if (catalogError || !catalog) throw catalogError ?? new Error('Could not create catalog.');
      catalogId = catalog.id;

      const { error: memberError } = await adminClient.from('catalog_members').insert({
        catalog_id: catalog.id,
        user_id: ownerUserId,
        role: 'owner'
      });
      if (memberError) throw memberError;

      const { error: themeError } = await adminClient.from('catalog_theme_settings').insert({
        catalog_id: catalog.id,
        settings: {}
      });
      if (themeError) throw themeError;

      const { error: sectionsError } = await adminClient.from('catalog_sections').insert([
        { catalog_id: catalog.id, key: 'hero', title: 'Главная', sort_order: 10 },
        { catalog_id: catalog.id, key: 'categories', title: 'Категории', sort_order: 20 },
        { catalog_id: catalog.id, key: 'products', title: 'Все позиции', sort_order: 30 },
        { catalog_id: catalog.id, key: 'contacts', title: 'Контакты', sort_order: 40 }
      ]);
      if (sectionsError) throw sectionsError;

      const { data: client, error: clientError } = await adminClient
        .from('clients')
        .insert({
          owner_user_id: ownerUserId,
          catalog_id: catalog.id,
          company_name: payload.name,
          owner_name: payload.ownerName ?? '',
          email: payload.email,
          phone: payload.phone ?? '',
          status: payload.status ?? 'active',
          plan_code: payload.planId ?? 'trial',
          subscription_status: payload.subscriptionStatus ?? 'trial',
          subscription_ends_at: payload.subscriptionEndsAt || null,
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 400);
  }
});
