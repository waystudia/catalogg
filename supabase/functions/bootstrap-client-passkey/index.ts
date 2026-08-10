import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';

type BootstrapPayload = {
  clientSessionToken?: string;
};

type ClientSession = {
  account_id?: string;
};

type ClientAccount = {
  id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
};

const defaultAllowedOrigins = [
  'https://wayyaam.ru',
  'https://www.wayyaam.ru',
  'http://localhost:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174'
];

const allowedOrigins = () => {
  const configured = Deno.env.get('CLIENT_PASSKEY_ALLOWED_ORIGINS')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : defaultAllowedOrigins);
};

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins().has(origin) ? origin : 'https://wayyaam.ru',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
});

const jsonResponse = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Unknown error';
};

const makePasskeyEmail = (accountId: string) =>
  `client-${accountId}@passkey.accounts.wayyaam.ru`;

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('CATALOGG_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Passkey service is not configured.' }, 500, origin);
  }

  try {
    const payload = (await request.json()) as BootstrapPayload;
    const clientSessionToken = payload.clientSessionToken?.trim() ?? '';
    if (clientSessionToken.length < 32 || clientSessionToken.length > 256) {
      return jsonResponse({ error: 'Client session is invalid.' }, 401, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: sessionData, error: sessionError } = await admin.rpc('get_client_account_session', {
      client_session_token: clientSessionToken
    });
    const session = sessionData as ClientSession | null;
    if (sessionError || typeof session?.account_id !== 'string') {
      return jsonResponse({ error: 'Client session is invalid.' }, 401, origin);
    }

    const { data: accountData, error: accountError } = await admin
      .from('client_accounts')
      .select('id, auth_user_id, name, phone')
      .eq('id', session.account_id)
      .maybeSingle();
    const account = accountData as ClientAccount | null;
    if (accountError || !account) {
      return jsonResponse({ error: 'Client account was not found.' }, 404, origin);
    }

    const authEmail = makePasskeyEmail(account.id);
    let authUserId = account.auth_user_id;
    let createdAuthUserId: string | null = null;

    if (!authUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        app_metadata: { wayyaam_role: 'client', client_account_id: account.id },
        user_metadata: { name: account.name, phone: account.phone }
      });

      if (!createError && created.user) {
        authUserId = created.user.id;
        createdAuthUserId = created.user.id;
      } else {
        // A previous interrupted bootstrap may already have created the
        // deterministic Auth identity before linking it to the client row.
        const { data: existingLink, error: existingLinkError } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: authEmail
        });
        if (existingLinkError || !existingLink.user?.id) throw createError ?? existingLinkError;
        authUserId = existingLink.user.id;
      }

      const { data: linkedUserId, error: linkError } = await admin.rpc('link_client_account_auth_user', {
        client_session_token: clientSessionToken,
        candidate_auth_user_id: authUserId
      });
      if (linkError || typeof linkedUserId !== 'string') throw linkError ?? new Error('Client Auth link failed.');

      if (linkedUserId !== authUserId && createdAuthUserId === authUserId) {
        await admin.auth.admin.deleteUser(createdAuthUserId);
      }
      authUserId = linkedUserId;
    }

    const { data: authUserResult, error: authUserError } = await admin.auth.admin.getUserById(authUserId);
    if (authUserError || !authUserResult.user) throw authUserError ?? new Error('Auth user was not found.');

    const userEmail = authUserResult.user.email || authEmail;
    if (!authUserResult.user.email) {
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
        email: authEmail,
        email_confirm: true,
        app_metadata: {
          ...authUserResult.user.app_metadata,
          wayyaam_role: 'client',
          client_account_id: account.id
        }
      });
      if (updateError) throw updateError;
    }

    const { data: magicLink, error: magicLinkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail
    });
    const tokenHash = magicLink?.properties?.hashed_token;
    if (magicLinkError || typeof tokenHash !== 'string' || !tokenHash) {
      throw magicLinkError ?? new Error('Passkey bootstrap token was not generated.');
    }

    return jsonResponse({ tokenHash }, 200, origin);
  } catch (error) {
    console.error('bootstrap-client-passkey failed:', errorMessage(error));
    return jsonResponse({ error: 'Не удалось подготовить вход по Face ID.' }, 500, origin);
  }
});
