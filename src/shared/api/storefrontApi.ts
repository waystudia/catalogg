import { normalizeBusinessType } from '../businessTerminology';
import { supabase } from '../supabase';
import { normalizeStorefrontHostname, type StorefrontContext } from '../../entities/storefront';

type StorefrontRow = {
  catalog_id: string;
  catalog_slug: string;
  business_type: string;
  hostname: string;
  brand_name: string;
  short_name: string;
  logo_url: string;
  icon_192_url: string;
  icon_512_url: string;
  theme_color: string;
  background_color: string;
  storefront_mode: string;
  powered_by_wayyaam: boolean;
};

export const mapStorefrontContext = (row: StorefrontRow): StorefrontContext => ({
  catalogId: row.catalog_id,
  catalogSlug: row.catalog_slug,
  businessType: normalizeBusinessType(row.business_type),
  hostname: normalizeStorefrontHostname(row.hostname),
  brandName: row.brand_name.trim(),
  shortName: row.short_name.trim(),
  logoUrl: row.logo_url?.trim() ?? '',
  icon192Url: row.icon_192_url?.trim() ?? '',
  icon512Url: row.icon_512_url?.trim() ?? '',
  themeColor: row.theme_color,
  backgroundColor: row.background_color,
  storefrontMode: row.storefront_mode === 'marketplace' ? 'marketplace' : 'exclusive',
  poweredByWayYaam: true
});

export async function getPublicStorefrontByHostname(hostname: string): Promise<StorefrontContext | null> {
  const normalizedHostname = normalizeStorefrontHostname(hostname);
  if (!supabase || !normalizedHostname) return null;
  const { data, error } = await supabase.rpc('get_public_storefront_by_hostname', {
    input_hostname: normalizedHostname
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as StorefrontRow | null;
  return row ? mapStorefrontContext(row) : null;
}
