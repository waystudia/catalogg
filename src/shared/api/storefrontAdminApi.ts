import { normalizeStorefrontHostname } from '../../entities/storefront';
import { supabase } from '../supabase';

export type CatalogStorefrontDomainStatus = 'pending' | 'active' | 'suspended';

export type CatalogStorefrontDomain = {
  id: string;
  catalogId: string;
  hostname: string;
  status: CatalogStorefrontDomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  storefrontMode: 'exclusive' | 'marketplace';
  brandName: string;
  shortName: string;
  logoUrl: string;
  icon192Url: string;
  icon512Url: string;
  themeColor: string;
  backgroundColor: string;
  poweredByWayYaam: true;
};

export type CatalogStorefrontDraft = Omit<
  CatalogStorefrontDomain,
  'id' | 'status' | 'verificationToken' | 'verifiedAt' | 'poweredByWayYaam'
>;

type CatalogStorefrontDomainRow = {
  id: string;
  catalog_id: string;
  hostname: string;
  status: CatalogStorefrontDomainStatus;
  verification_token: string;
  verified_at: string | null;
  storefront_mode: string;
  brand_name: string;
  short_name: string;
  logo_url: string | null;
  icon_192_url: string | null;
  icon_512_url: string | null;
  theme_color: string;
  background_color: string;
  powered_by_wayyaam: boolean;
};

const storefrontColumns = [
  'id',
  'catalog_id',
  'hostname',
  'status',
  'verification_token',
  'verified_at',
  'storefront_mode',
  'brand_name',
  'short_name',
  'logo_url',
  'icon_192_url',
  'icon_512_url',
  'theme_color',
  'background_color',
  'powered_by_wayyaam'
].join(', ');

const mapCatalogStorefrontDomain = (row: CatalogStorefrontDomainRow): CatalogStorefrontDomain => ({
  id: row.id,
  catalogId: row.catalog_id,
  hostname: row.hostname,
  status: row.status,
  verificationToken: row.verification_token,
  verifiedAt: row.verified_at,
  storefrontMode: row.storefront_mode === 'marketplace' ? 'marketplace' : 'exclusive',
  brandName: row.brand_name,
  shortName: row.short_name,
  logoUrl: row.logo_url ?? '',
  icon192Url: row.icon_192_url ?? '',
  icon512Url: row.icon_512_url ?? '',
  themeColor: row.theme_color,
  backgroundColor: row.background_color,
  poweredByWayYaam: true
});

const storefrontError = (message: string) => {
  if (message.includes('catalog_storefront_hostname_taken')) return 'Этот домен уже привязан к другому каталогу.';
  if (message.includes('catalog_storefront_reserved_hostname')) return 'Этот домен зарезервирован для WayYaam.';
  if (message.includes('catalog_storefront_published_catalog_required')) return 'Сначала опубликуйте каталог.';
  if (message.includes('catalog_storefront_verification_required')) return 'Нужен актуальный токен проверки DNS.';
  return message;
};

export async function getCatalogStorefrontDomain(catalogId: string): Promise<CatalogStorefrontDomain | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('catalog_storefront_domains')
    .select(storefrontColumns)
    .eq('catalog_id', catalogId)
    .eq('is_primary', true)
    .maybeSingle();
  if (error) throw new Error(storefrontError(error.message));
  return data ? mapCatalogStorefrontDomain(data as unknown as CatalogStorefrontDomainRow) : null;
}

export async function saveCatalogStorefrontDomain(draft: CatalogStorefrontDraft): Promise<string> {
  if (!supabase) return crypto.randomUUID();
  const { data, error } = await supabase.rpc('save_catalog_storefront_domain', {
    target_catalog_id: draft.catalogId,
    target_hostname: normalizeStorefrontHostname(draft.hostname),
    target_brand_name: draft.brandName.trim(),
    target_short_name: draft.shortName.trim(),
    target_logo_url: draft.logoUrl.trim(),
    target_icon_192_url: draft.icon192Url.trim(),
    target_icon_512_url: draft.icon512Url.trim(),
    target_theme_color: draft.themeColor.toUpperCase(),
    target_background_color: draft.backgroundColor.toUpperCase(),
    target_storefront_mode: draft.storefrontMode
  });
  if (error) throw new Error(storefrontError(error.message));
  return String(data);
}

export async function setCatalogStorefrontDomainStatus(
  domainId: string,
  status: CatalogStorefrontDomainStatus,
  verificationToken?: string
) {
  if (!supabase) return status;
  const { data, error } = await supabase.rpc('set_catalog_storefront_domain_status', {
    target_domain_id: domainId,
    target_status: status,
    target_verification_token: verificationToken ?? null
  });
  if (error) throw new Error(storefrontError(error.message));
  return String(data) as CatalogStorefrontDomainStatus;
}
