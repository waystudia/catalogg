import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  'Content-Type': 'application/manifest+json; charset=utf-8'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const absoluteAssetUrl = (hostname: string, value: unknown, fallback: string) => {
  const asset = text(value) || fallback;
  if (/^https:\/\//i.test(asset)) return asset;
  return `https://${hostname}/${asset.replace(/^\/+/, '')}`;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Storefront manifest is not configured' }, 503);

  const hostname = text(new URL(request.url).searchParams.get('hostname')).toLowerCase();
  if (!hostname) return json({ error: 'Hostname is required' }, 400);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.rpc('get_public_storefront_by_hostname', {
    input_hostname: hostname
  });
  if (error) return json({ error: 'Storefront lookup failed' }, 500);
  const storefront = Array.isArray(data) ? data[0] : data;
  if (!storefront) return json({ error: 'Storefront not found' }, 404);

  const verifiedHostname = text(storefront.hostname);
  const origin = `https://${verifiedHostname}`;
  return json({
    id: `${origin}/`,
    name: text(storefront.brand_name),
    short_name: text(storefront.short_name),
    description: `${text(storefront.brand_name)} — витрина и доставка на платформе WayYaam`,
    lang: 'ru',
    start_url: `${origin}/`,
    scope: `${origin}/`,
    display: 'standalone',
    theme_color: text(storefront.theme_color) || '#6C5CE7',
    background_color: text(storefront.background_color) || '#F5F6F8',
    icons: [
      {
        src: absoluteAssetUrl(verifiedHostname, storefront.icon_192_url, 'assets/logo/wayyaam-icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: absoluteAssetUrl(verifiedHostname, storefront.icon_512_url, 'assets/logo/wayyaam-icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ],
    powered_by_wayyaam: true
  });
});
