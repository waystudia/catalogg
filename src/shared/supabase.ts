import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { cabins, categories, products, restaurant, themeSettings } from '../data/catalog';
import type { Cabin, CatalogTag, Category, Product, ProductChoiceOptionInput, ProductModifierGroup, Restaurant, ThemeSettings } from '../entities/models';
import { normalizeProductChoiceOptions } from '../entities/productVariants';
import { normalizeProductModifierGroups } from '../entities/productModifiers';
import { confectioneryTemplate } from '../templates/confectionery';
import { normalizeBusinessType } from './businessTerminology';
import {
  categoryToLegacyPersistence,
  normalizeLegacyCategory,
  parseCabinMeta
} from '../features/restaurant-settings/catalogAdminModel';
import { catalogAccessAllowsAdmin } from './adminSession';
import { clearPwaResumePath, readPwaResumePath } from './pwaSession';
import { settleRestaurantSessionCheck } from './restaurantSession';
import { makeRestaurantCoordinates, parseRestaurantCoordinatesFromMapLink } from './restaurantLocation';
import {
  DEFAULT_PHOTO_QUALITY_SETTINGS,
  normalizePhotoQualitySettings,
  type PhotoQualitySettings
} from './photoQuality';
import {
  copySupabaseSessionToScope,
  getSupabaseAuthScope,
  getSupabaseAuthFallbackStorageKeys,
  getSupabaseAuthStorageKey,
  getSupabaseStartupAuthScope,
  handoffSupabaseSessionToScope
} from './supabaseAuthScope';
import { buildPasswordCredentials } from './loginIdentifier';

type SupabaseConfig = {
  url?: string;
  anonKey?: string;
};

const config: SupabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
};

const currentAuthScope = typeof window === 'undefined'
  ? getSupabaseAuthScope('/')
  : getSupabaseStartupAuthScope(window.location.hash, readPwaResumePath());
const currentAuthStorageKey = getSupabaseAuthStorageKey(currentAuthScope);

if (typeof window !== 'undefined') {
  try {
    if (!window.localStorage.getItem(currentAuthStorageKey)) {
      const fallbackSession = getSupabaseAuthFallbackStorageKeys(currentAuthScope)
        .map((key) => window.localStorage.getItem(key))
        .find(Boolean);
      if (fallbackSession) window.localStorage.setItem(currentAuthStorageKey, fallbackSession);
    }
  } catch {
    // Supabase falls back to an in-memory session when browser storage is unavailable.
  }
}

export const supabase: SupabaseClient | null =
  config.url && config.anonKey
    ? createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: currentAuthStorageKey,
          experimental: { passkey: true }
        }
      })
    : null;

const passwordLoginClient: SupabaseClient | null =
  config.url && config.anonKey
    ? createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
          storageKey: 'waycatalog-auth-password-login',
          experimental: { passkey: true }
        },
        global: {
          fetch: async (input, init) => {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
            try {
              return await fetch(input, { ...init, signal: controller.signal });
            } finally {
              window.clearTimeout(timeoutId);
            }
          }
        }
      })
    : null;

const isTransientAuthError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; message?: unknown; code?: unknown };
  const status = Number(value.status ?? 0);
  const message = `${String(value.code ?? '')} ${String(value.message ?? '')}`.toLowerCase();
  return (
    status >= 500 ||
    message.includes('timeout') ||
    message.includes('deadline') ||
    message.includes('failed to fetch') ||
    message.includes('abort') ||
    message.includes('signal') ||
    message.includes('unexpected_failure')
  );
};

export async function signInWithPasswordResilient(identifier: string, password: string) {
  if (!passwordLoginClient || !supabase) {
    return { data: { session: null, user: null }, error: new Error('Supabase не настроен') };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await passwordLoginClient.auth.signInWithPassword(
        buildPasswordCredentials(identifier, password)
      );
      if (!result.error && result.data.session) {
        const sessionResult = await supabase.auth.setSession({
          access_token: result.data.session.access_token,
          refresh_token: result.data.session.refresh_token
        });
        if (sessionResult.error) return sessionResult;
        return sessionResult;
      }
      lastError = result.error;
      if (!isTransientAuthError(result.error)) return result;
      if (attempt === 1) break;
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  return {
    data: { session: null, user: null },
    error: new Error(
      isTransientAuthError(lastError) || (lastError instanceof DOMException && lastError.name === 'AbortError')
        ? 'Сервис входа временно отвечает медленно. Повторите вход ещё раз.'
        : 'Не удалось подключиться к сервису входа.'
    )
  };
}

export const preserveSupabaseSessionForRedirect = (redirect: string) => {
  if (typeof window === 'undefined') return;
  try {
    const serializedSession = window.localStorage.getItem(currentAuthStorageKey);
    if (!serializedSession) return;
    handoffSupabaseSessionToScope(getSupabaseAuthScope(redirect), serializedSession, currentAuthScope);
  } catch {
    // The active tab still keeps the authenticated session in memory.
  }
};

const legacyCatalogSlug = 'mangal';
let activePlatformCatalogId: string | null = null;
let activeCatalogIsLegacy = true;

const normalizeCatalogSlug = (catalogSlug?: string) =>
  (catalogSlug || legacyCatalogSlug).trim().toLowerCase().replace(/^\/+|\/+$/g, '') || legacyCatalogSlug;

const isLegacyCatalog = (catalogSlug?: string) => normalizeCatalogSlug(catalogSlug) === legacyCatalogSlug;

const getLocalTemplateCatalog = (catalogSlug: string) => catalogSlug === confectioneryTemplate.slug
  ? {
      restaurant: confectioneryTemplate.restaurant,
      categories: [...confectioneryTemplate.categories],
      products: [...confectioneryTemplate.products],
      cabins: [] as Cabin[],
      tags: [] as CatalogTag[],
      theme: confectioneryTemplate.theme,
      photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
      source: 'demo' as const
    }
  : null;

const normalizeRestaurant = (value?: Restaurant | null): Restaurant => ({
  ...restaurant,
  ...(value ?? {}),
  mapLink: value?.mapLink ?? ''
});

const normalizeRestaurantGallery = (settings: unknown, fallbackUrl?: string | null) => {
  const images =
    settings && typeof settings === 'object' && Array.isArray((settings as { images?: unknown }).images)
      ? (settings as { images: unknown[] }).images
      : [];
  return Array.from(
    new Set(
      [...images, fallbackUrl]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
};

const normalizeProductChoices = (settings: unknown): Record<string, ProductChoiceOptionInput[]> => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return Object.fromEntries(
    Object.entries(settings as Record<string, unknown>)
      .map(([productId, value]) => [
        productId,
        Array.isArray(value)
          ? value.filter((item): item is ProductChoiceOptionInput =>
              typeof item === 'string'
              || (typeof item === 'object' && item !== null && typeof (item as { name?: unknown }).name === 'string')
            ).slice(0, 6)
          : []
      ])
      .filter(([, value]) => (value as ProductChoiceOptionInput[]).length > 0)
  );
};

const applyProductChoices = (values: Product[], settings: unknown) => {
  const choices = normalizeProductChoices(settings);
  return values.map((product) => ({
    ...product,
    choice_options: normalizeProductChoiceOptions(choices[product.id] ?? product.choice_options, product.price)
  }));
};

const gradientMarkerPrefix = 'gradient:';

const hydrateTheme = (value?: Partial<ThemeSettings> | null): ThemeSettings => {
  const next = { ...themeSettings, ...(value ?? {}) };
  if (next.background_image_url?.startsWith(gradientMarkerPrefix)) {
    return {
      ...next,
      background_type: 'gradient',
      background_gradient_from: next.background_color,
      background_gradient_to: next.background_image_url.slice(gradientMarkerPrefix.length) || next.background_color,
      background_image_url: ''
    };
  }
  return {
    ...next,
    background_gradient_from: next.background_gradient_from ?? next.background_color,
    background_gradient_to: next.background_gradient_to ?? next.accent_secondary ?? next.background_color
  };
};

const themeToLegacyRow = (value: ThemeSettings) => {
  const {
    background_gradient_from,
    background_gradient_to,
    background_type,
    background_color,
    background_image_url,
    ...rest
  } = value;
  if (background_type === 'gradient') {
    return {
      ...rest,
      background_type: 'color',
      background_color: background_gradient_from ?? background_color,
      background_image_url: `${gradientMarkerPrefix}${background_gradient_to ?? background_color}`
    };
  }
  return {
    ...rest,
    background_type,
    background_color,
    background_image_url
  };
};

type PlatformCatalogRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  whatsapp: string | null;
  instagram_url: string | null;
  address: string | null;
  map_url: string | null;
  business_type: string | null;
};

type PlatformRestaurantLocationRow = {
  id: string;
  catalog_id: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
};

type PlatformCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
};

type PlatformProductRow = {
  id: string;
  category_id: string | null;
  title: string;
  status: string;
  price: number;
  description: string;
  ingredients: string;
  weight: string;
  serving: string;
  stock_count: number;
  is_unlimited: boolean;
  is_popular: boolean;
  is_new: boolean;
  is_promo: boolean;
  custom_fields?: unknown;
  sku: string;
  barcode: string;
  sale_unit: Product['sale_unit'];
  quantity_unit: Product['quantity_unit'];
  price_basis_quantity: number;
  minimum_quantity: number;
  quantity_step: number;
  stock_quantity: number;
  allow_substitution: boolean;
};

type PlatformProductImageRow = {
  product_id: string;
  url: string;
  sort_order: number;
};

type PlatformProductModifierGroupRow = {
  id: string;
  product_id: string;
  name: string;
  required: boolean;
  min_selected: number;
  max_selected: number;
  is_active: boolean;
};

type PlatformProductModifierOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_active: boolean;
};

const applyProductModifiers = (
  values: Product[],
  groupRows: PlatformProductModifierGroupRow[],
  optionRows: PlatformProductModifierOptionRow[]
) => values.map((product) => ({
  ...product,
  modifier_groups: normalizeProductModifierGroups(groupRows
    .filter((group) => group.product_id === product.id)
    .map((group): ProductModifierGroup => ({
      id: group.id,
      name: group.name,
      required: group.required,
      minSelected: group.min_selected,
      maxSelected: group.max_selected,
      isActive: group.is_active,
      options: optionRows
        .filter((option) => option.group_id === group.id)
        .map((option) => ({
          id: option.id,
          name: option.name,
          priceDelta: Number(option.price_delta),
          isDefault: option.is_default,
          isActive: option.is_active
        }))
    })))
}));

const productConfigKeys = [
  'old_price',
  'pricing_type',
  'price_prefix',
  'price_tier',
  'unit',
  'minimum_weight',
  'weight_step',
  'preparation_time',
  'advance_order_hours',
  'allergens',
  'badges',
  'allow_inscription',
  'allow_decoration_comment',
  'allow_production_schedule',
  'placeholder_kind'
] as const satisfies ReadonlyArray<keyof Product>;

const applyProductConfig = (values: Product[], settings: unknown) => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return values;
  const configs = settings as Record<string, unknown>;
  return values.map((product) => {
    const raw = configs[product.id];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return product;
    const source = raw as Record<string, unknown>;
    const patch: Partial<Product> = {};
    productConfigKeys.forEach((key) => {
      if (source[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = source[key];
      }
    });
    return { ...product, ...patch };
  });
};

const applyPopularCategory = (values: Product[], categoryValues: Category[]) => {
  const popularId = categoryValues.find((category) => category.slug === 'popular')?.id;
  if (!popularId) return values;
  return values.map((product) => ({
    ...product,
    category_ids: Array.from(new Set([
      ...(product.category_ids ?? [product.category_id]),
      ...(product.is_popular ? [popularId] : [])
    ]))
  }));
};

type PlatformCabinRow = {
  id: string;
  title: string;
  capacity: number;
  image_url: string | null;
  is_active?: boolean | null;
  capacity_text?: string | null;
  resource_type?: string | null;
  price?: number | null;
};

const drinkCategorySlugs = new Set(['fridge', 'lemonades', 'tea']);

const mapPlatformRestaurant = (value: PlatformCatalogRow): Restaurant => ({
  ...restaurant,
  id: value.id,
  name: value.name,
  subtitle: value.description ?? '',
  logo_url: value.logo_url ?? '',
  banner_url: value.banner_url ?? '',
  whatsapp: value.whatsapp ?? '',
  instagram_url: value.instagram_url ?? '',
  address: value.address ?? '',
  mapLink: value.map_url ?? '',
  business_type: normalizeBusinessType(value.business_type)
});

const applyCatalogInfo = (value: Restaurant, settings: unknown): Restaurant => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return value;
  const source = settings as Record<string, unknown>;
  return {
    ...value,
    catalog_notice: typeof source.catalog_notice === 'string' ? source.catalog_notice : value.catalog_notice,
    working_hours: typeof source.working_hours === 'string' ? source.working_hours : value.working_hours,
    minimum_order: typeof source.minimum_order === 'number' ? source.minimum_order : value.minimum_order
  };
};

const withRestaurantLocation = (
  value: Restaurant,
  location?: Pick<PlatformRestaurantLocationRow, 'address_line' | 'lat' | 'lng'> | null
): Restaurant => {
  const linkCoordinates = parseRestaurantCoordinatesFromMapLink(value.mapLink);
  return {
    ...value,
    address: value.address || location?.address_line || '',
    lat: linkCoordinates?.lat ?? location?.lat ?? value.lat ?? null,
    lng: linkCoordinates?.lng ?? location?.lng ?? value.lng ?? null
  };
};

const parseCategoryMeta = (value?: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as { showOnHome?: boolean; showInOrderFlow?: boolean; kind?: Category['kind'] };
  } catch {
    return {};
  }
};

const mapPlatformCategory = (value: PlatformCategoryRow): Category => {
  const meta = parseCategoryMeta(value.description);
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    image: value.image_url ?? '',
    icon: value.icon ?? '',
    kind: meta.kind ?? (value.slug === 'cabins' ? 'space' : drinkCategorySlugs.has(value.slug) ? 'drink' : 'food'),
    showOnHome: meta.showOnHome ?? true,
    showInOrderFlow: meta.showInOrderFlow ?? false
  };
};

const mapPlatformProduct = (value: PlatformProductRow, imageUrls: readonly string[] = []): Product => ({
  id: value.id,
  title: value.title,
  price: value.price,
  description: value.description,
  image_url: imageUrls[0] ?? '',
  image_urls: [...imageUrls],
  ingredients: value.ingredients,
  weight: value.weight,
  spicy_level: 0,
  serving: value.serving,
  is_popular: value.is_popular,
  is_new: value.is_new,
  is_hit: value.is_promo,
  is_hidden: value.status !== 'active' && value.status !== 'sold_out',
  daily_stock: value.stock_count,
  current_stock: value.stock_count,
  is_unlimited: value.is_unlimited,
  stock_count: value.stock_count,
  category_id: value.category_id ?? '',
  category_ids: value.category_id ? [value.category_id] : [],
  pair_ids: [],
  sku: value.sku,
  barcode: value.barcode,
  sale_unit: value.sale_unit,
  quantity_unit: value.quantity_unit,
  price_basis_quantity: value.price_basis_quantity,
  minimum_quantity: value.minimum_quantity,
  quantity_step: value.quantity_step,
  stock_quantity: value.stock_quantity,
  allow_substitution: value.allow_substitution,
  ...(() => {
    if (!value.custom_fields || typeof value.custom_fields !== 'object' || Array.isArray(value.custom_fields)) return {};
    const source = value.custom_fields as Record<string, unknown>;
    const patch: Partial<Product> = {};
    productConfigKeys.forEach((key) => {
      if (source[key] !== undefined) (patch as Record<string, unknown>)[key] = source[key];
    });
    patch.choice_options = Array.isArray(source.choice_options)
      ? normalizeProductChoiceOptions(source.choice_options as ProductChoiceOptionInput[], value.price)
      : undefined;
    return patch;
  })()
});

const mapPlatformCabin = (value: PlatformCabinRow): Cabin => ({
  id: value.id,
  title: value.title,
  capacity: value.capacity_text?.trim() || `до ${value.capacity} гостей`,
  feature: JSON.stringify({
    kind: value.resource_type === 'table' ? 'table' : 'cabin',
    status: value.is_active === false ? 'inactive' : 'active',
    type: 'normal',
    price: Math.max(0, Number(value.price) || 0)
  }),
  image_url: value.image_url ?? ''
});

async function getPlatformCatalogId(catalogSlug: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('catalogs')
    .select('id')
    .eq('slug', normalizeCatalogSlug(catalogSlug))
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

async function getPlatformRestaurantLocation(catalogId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, catalog_id, address_line, lat, lng')
    .eq('catalog_id', catalogId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PlatformRestaurantLocationRow;
}

async function savePlatformRestaurantLocation(catalogId: string, value: Restaurant) {
  if (!supabase) return;
  const coordinates = parseRestaurantCoordinatesFromMapLink(value.mapLink) ?? makeRestaurantCoordinates(value.lat, value.lng);
  const payload = {
    address_line: value.address,
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null
  };
  const existing = await getPlatformRestaurantLocation(catalogId);
  if (existing?.id) {
    const { error } = await supabase.from('restaurants').update(payload).eq('id', existing.id);
    if (error) {
      console.warn('Could not sync platform restaurant location', error);
    }
    return;
  }

  const slug = normalizeCatalogSlug(value.id);
  const { error } = await supabase.from('restaurants').upsert({
    catalog_id: catalogId,
    name: value.name || slug,
    slug,
    description: value.subtitle,
    logo_url: value.logo_url,
    cover_url: value.banner_url,
    address_line: value.address,
    lat: payload.lat,
    lng: payload.lng
  }, { onConflict: 'slug' });
  if (error) {
    console.warn('Could not create platform restaurant location', error);
  }
}

export async function signInAdmin(email: string, password: string, catalogSlug?: string) {
  if (!supabase) {
    return email.trim().toLowerCase() === 'admin' && password.trim() === '1234';
  }

  const { data, error } = await signInWithPasswordResilient(email, password);

  if (error || !data.session) return false;

  const normalizedSlug = normalizeCatalogSlug(catalogSlug);
  const isAdmin = await hasAdminSession(normalizedSlug, data.session);
  if (!isAdmin) {
    await supabase.auth.signOut();
  }
  if (isAdmin) copySupabaseSessionToScope('restaurant-admin');
  return isAdmin;
}

export async function signOutAdmin() {
  clearPwaResumePath();
  if (typeof window !== 'undefined') {
    try {
      getSupabaseAuthFallbackStorageKeys('restaurant-admin').forEach((key) => {
        window.localStorage.removeItem(key);
      });
    } catch {
      // Leaving the restaurant area must still complete when storage is unavailable.
    }
  }
  if (!supabase) return;
  void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

async function resolveAdminSession(catalogSlug?: string, knownSession?: Session | null) {
  if (!supabase) return false;
  const sessionResult =
    knownSession !== undefined
      ? { data: { session: knownSession } }
      : await supabase.auth.getSession();
  const session = sessionResult.data.session;
  if (!session) return false;

  const normalizedSlug = normalizeCatalogSlug(catalogSlug);
  const { data: rpcAccess, error: rpcError } = await supabase.rpc('has_catalog_admin_access', {
    target_slug: normalizedSlug
  });
  if (!rpcError) return Boolean(rpcAccess);

  const rpcErrorText = `${rpcError.code ?? ''} ${rpcError.message ?? ''}`.toLowerCase();
  const rpcIsMissing =
    rpcErrorText.includes('pgrst202') ||
    (rpcErrorText.includes('has_catalog_admin_access') && rpcErrorText.includes('not found'));
  if (!rpcIsMissing) return false;

  const platformCatalogId = await getPlatformCatalogId(normalizedSlug);
  let hasPlatformClientAccess = false;
  let hasCatalogMemberAccess = false;

  if (platformCatalogId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('catalog_id', platformCatalogId)
      .eq('owner_user_id', session.user.id)
      .maybeSingle();

    hasPlatformClientAccess = Boolean(client);

    const { data: member } = await supabase
      .from('catalog_members')
      .select('user_id')
      .eq('catalog_id', platformCatalogId)
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    hasCatalogMemberAccess = Boolean(member);
  }

  const { data: adminUser } = await supabase
    .from('admin_user')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return catalogAccessAllowsAdmin({
    isLegacyCatalogSlug: isLegacyCatalog(normalizedSlug),
    hasPlatformClientAccess: hasPlatformClientAccess || hasCatalogMemberAccess,
    hasLegacyAdminAccess: Boolean(adminUser)
  });
}

export async function hasAdminSession(catalogSlug?: string, knownSession?: Session | null) {
  return settleRestaurantSessionCheck(resolveAdminSession(catalogSlug, knownSession));
}

export function onAdminSessionChange(callback: (isAdmin: boolean) => void, catalogSlug?: string) {
  if (!supabase) return () => undefined;

  let sessionCheckTimeoutId: ReturnType<typeof setTimeout> | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    clearTimeout(sessionCheckTimeoutId);
    if (!session) {
      callback(false);
      return;
    }
    sessionCheckTimeoutId = setTimeout(() => {
      void hasAdminSession(catalogSlug, session).then(callback).catch(() => undefined);
    }, 0);
  });

  return () => {
    clearTimeout(sessionCheckTimeoutId);
    data.subscription.unsubscribe();
  };
}

export async function loadCatalog(catalogSlug?: string) {
  const normalizedSlug = normalizeCatalogSlug(catalogSlug);
  activePlatformCatalogId = null;
  activeCatalogIsLegacy = isLegacyCatalog(normalizedSlug);

  if (!supabase) {
    const localTemplate = getLocalTemplateCatalog(normalizedSlug);
    if (localTemplate) return localTemplate;
    return {
      restaurant,
      categories,
      products,
      cabins,
      tags: [],
      theme: themeSettings,
      photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
      source: 'demo' as const
    };
  }

  if (!isLegacyCatalog(normalizedSlug)) {
    const catalogResult = await supabase
      .from('catalogs')
      .select('id, slug, name, description, logo_url, banner_url, whatsapp, instagram_url, address, map_url, business_type')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (!catalogResult.data || catalogResult.error) {
      const localTemplate = getLocalTemplateCatalog(normalizedSlug);
      if (localTemplate) return localTemplate;
      return {
        restaurant: { ...restaurant, name: normalizedSlug, subtitle: '', logo_url: '', banner_url: '' },
        categories: [],
        products: [],
        cabins: [],
        tags: [],
        theme: themeSettings,
        photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
        source: 'supabase' as const
      };
    }

    const catalog = catalogResult.data as PlatformCatalogRow;
    activePlatformCatalogId = catalog.id;

    const [
      categoriesResult,
      productsResult,
      productImagesResult,
      tagsResult,
      cabinsResult,
      themeResult,
      photoQualityResult,
      restaurantGalleryResult,
      productChoicesResult,
      productModifierGroupsResult,
      productModifierOptionsResult,
      productConfigResult,
      catalogInfoResult,
      restaurantLocation
    ] = await Promise.all([
      supabase.from('categories').select('id, slug, name, description, image_url, icon').eq('catalog_id', catalog.id).order('sort_order'),
      supabase
        .from('products')
        .select('id, category_id, title, status, price, sku, barcode, sale_unit, quantity_unit, price_basis_quantity, minimum_quantity, quantity_step, stock_quantity, allow_substitution, description, ingredients, weight, serving, stock_count, is_unlimited, is_popular, is_new, is_promo, custom_fields')
        .eq('catalog_id', catalog.id)
        .order('sort_order'),
      supabase
        .from('product_images')
        .select('product_id, url, sort_order')
        .eq('catalog_id', catalog.id)
        .order('sort_order'),
      supabase.from('tags').select('id, slug, name, icon, color').eq('catalog_id', catalog.id).order('sort_order'),
      supabase
        .from('bookable_resources')
        .select('id, title, capacity, image_url, is_active, capacity_text, resource_type, price')
        .eq('catalog_id', catalog.id)
        .order('sort_order'),
      supabase.from('catalog_theme_settings').select('settings').eq('catalog_id', catalog.id).maybeSingle(),
      supabase
        .from('catalog_sections')
        .select('settings, enabled')
        .eq('catalog_id', catalog.id)
        .eq('key', 'photo-quality')
        .maybeSingle(),
      supabase
        .from('catalog_sections')
        .select('settings')
        .eq('catalog_id', catalog.id)
        .eq('key', 'restaurant-gallery')
        .maybeSingle(),
      supabase
        .from('catalog_sections')
        .select('settings')
        .eq('catalog_id', catalog.id)
        .eq('key', 'product-choices')
        .maybeSingle(),
      supabase
        .from('product_option_groups')
        .select('id, product_id, name, required, min_selected, max_selected, is_active')
        .eq('catalog_id', catalog.id)
        .order('sort_order'),
      supabase
        .from('product_options')
        .select('id, group_id, name, price_delta, is_default, is_active')
        .eq('catalog_id', catalog.id)
        .order('sort_order'),
      supabase
        .from('catalog_sections')
        .select('settings')
        .eq('catalog_id', catalog.id)
        .eq('key', 'product-config')
        .maybeSingle(),
      supabase
        .from('catalog_sections')
        .select('settings')
        .eq('catalog_id', catalog.id)
        .eq('key', 'catalog-info')
        .maybeSingle(),
      getPlatformRestaurantLocation(catalog.id)
    ]);
    const productImages = new Map<string, string[]>();
    ((productImagesResult.data ?? []) as PlatformProductImageRow[]).forEach((imageRow) => {
      productImages.set(imageRow.product_id, [...(productImages.get(imageRow.product_id) ?? []), imageRow.url]);
    });

    const mappedCategories = ((categoriesResult.data ?? []) as PlatformCategoryRow[]).map(mapPlatformCategory);
    const mappedProducts = applyPopularCategory(applyProductConfig(applyProductModifiers(
      applyProductChoices(
        ((productsResult.data ?? []) as PlatformProductRow[]).map((product) =>
          mapPlatformProduct(product, productImages.get(product.id) ?? [])
        ),
        productChoicesResult.data?.settings
      ),
      (productModifierGroupsResult.data ?? []) as PlatformProductModifierGroupRow[],
      (productModifierOptionsResult.data ?? []) as PlatformProductModifierOptionRow[]
    ), productConfigResult.data?.settings), mappedCategories);

    return {
      restaurant: applyCatalogInfo({
        ...withRestaurantLocation(mapPlatformRestaurant(catalog), restaurantLocation),
        banner_urls: normalizeRestaurantGallery(
          restaurantGalleryResult.data?.settings,
          catalog.banner_url
        )
      }, catalogInfoResult.data?.settings),
      categories: mappedCategories,
      products: mappedProducts,
      cabins: ((cabinsResult.data ?? []) as PlatformCabinRow[]).map(mapPlatformCabin),
      tags: (tagsResult.data ?? []) as CatalogTag[],
      theme: hydrateTheme(themeResult.data?.settings as Partial<ThemeSettings> | undefined),
      photoQuality: normalizePhotoQualitySettings({
        ...((photoQualityResult.data?.settings as Partial<PhotoQualitySettings> | null) ?? {}),
        enabled: photoQualityResult.data?.enabled ?? false
      }),
      source: 'supabase' as const
    };
  }

  const platformCatalogId = await getPlatformCatalogId(normalizedSlug);
  activePlatformCatalogId = platformCatalogId;
  const [
    restaurantResult,
    categoriesResult,
    productsResult,
    cabinsResult,
    tagsResult,
    themeResult,
    photoQualityResult,
    restaurantGalleryResult,
    productChoicesResult,
    restaurantLocation
  ] = await Promise.all([
    supabase.from('restaurant').select('*').limit(1).single(),
    supabase.from('category').select('*').order('sort_order', { ascending: true }).order('name'),
    supabase.from('product').select('*').order('sort_order', { ascending: true }).order('title'),
    supabase.from('cabin').select('*').order('sort_order', { ascending: true }).order('title'),
    supabase.from('catalog_tag').select('*').order('sort_order', { ascending: true }).order('name'),
    supabase.from('theme_settings').select('*').limit(1).single(),
    platformCatalogId
      ? supabase
          .from('catalog_sections')
          .select('settings, enabled')
          .eq('catalog_id', platformCatalogId)
          .eq('key', 'photo-quality')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    platformCatalogId
      ? supabase
          .from('catalog_sections')
          .select('settings')
          .eq('catalog_id', platformCatalogId)
          .eq('key', 'restaurant-gallery')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    platformCatalogId
      ? supabase
          .from('catalog_sections')
          .select('settings')
          .eq('catalog_id', platformCatalogId)
          .eq('key', 'product-choices')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    platformCatalogId ? getPlatformRestaurantLocation(platformCatalogId) : Promise.resolve(null)
  ]);

  return {
    restaurant: {
      ...withRestaurantLocation(normalizeRestaurant(restaurantResult.data), restaurantLocation),
      banner_urls: normalizeRestaurantGallery(
        restaurantGalleryResult.data?.settings,
        restaurantResult.data?.banner_url
      )
    },
    categories: (categoriesResult.data ?? categories).map((category) =>
      normalizeLegacyCategory(category as Parameters<typeof normalizeLegacyCategory>[0])
    ),
    products: applyProductChoices(productsResult.data ?? products, productChoicesResult.data?.settings),
    cabins: cabinsResult.data ?? cabins,
    tags: tagsResult.data ?? [],
    theme: hydrateTheme(themeResult.data),
    photoQuality: normalizePhotoQualitySettings({
      ...((photoQualityResult.data?.settings as Partial<PhotoQualitySettings> | null) ?? {}),
      enabled: photoQualityResult.data?.enabled ?? false
    }),
    source: 'supabase' as const
  };
}

async function throwOnError<T>(request: PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await request;
  if (error) {
    throw error;
  }
  return data;
}

const postgrestList = (values: string[]) => `(${values.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')})`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || crypto.randomUUID();

const productToPlatformRow = (product: Product) => ({
  catalog_id: activePlatformCatalogId,
  category_id: product.category_id && uuidPattern.test(product.category_id) ? product.category_id : null,
  title: product.title,
  slug: product.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID(),
  status: product.is_hidden ? 'hidden' : product.stock_count <= 0 && !product.is_unlimited ? 'sold_out' : 'active',
  price: product.price,
  description: product.description,
  ingredients: product.ingredients,
  weight: product.weight,
  serving: product.serving,
  stock_count: product.current_stock ?? product.stock_count ?? 0,
  is_unlimited: product.is_unlimited ?? false,
  is_popular: product.is_popular,
  is_new: product.is_new,
  is_promo: product.is_hit,
  sku: product.sku ?? '',
  barcode: product.barcode ?? '',
  sale_unit: product.sale_unit ?? 'piece',
  quantity_unit: product.quantity_unit ?? 'piece',
  price_basis_quantity: product.price_basis_quantity ?? 1,
  minimum_quantity: product.minimum_quantity ?? 1,
  quantity_step: product.quantity_step ?? 1,
  stock_quantity: product.stock_quantity ?? product.current_stock ?? product.stock_count ?? 0,
  allow_substitution: product.allow_substitution ?? false,
  custom_fields: {
    ...getProductConfig(product),
    choice_options: normalizeProductChoiceOptions(product.choice_options, product.price)
  }
});

async function saveProductChoices(product: Product) {
  if (!supabase || !activePlatformCatalogId) return;
  const current = await throwOnError(
    supabase
      .from('catalog_sections')
      .select('settings')
      .eq('catalog_id', activePlatformCatalogId)
      .eq('key', 'product-choices')
      .maybeSingle()
  ) as { settings?: unknown } | null;
  const settings = normalizeProductChoices(current?.settings);
  const choices = normalizeProductChoiceOptions(product.choice_options, product.price);
  if (choices.length > 0) settings[product.id] = choices;
  else delete settings[product.id];
  await throwOnError(
    supabase.from('catalog_sections').upsert(
      {
        catalog_id: activePlatformCatalogId,
        key: 'product-choices',
        title: 'Варианты блюд',
        enabled: Object.keys(settings).length > 0,
        sort_order: 110,
        settings
      },
      { onConflict: 'catalog_id,key' }
    )
  );
}

async function saveProductModifiers(product: Product) {
  if (!supabase || !activePlatformCatalogId || !uuidPattern.test(product.id)) return;
  const groups = normalizeProductModifierGroups(product.modifier_groups);
  await throwOnError(
    supabase.from('product_option_groups').delete().eq('catalog_id', activePlatformCatalogId).eq('product_id', product.id)
  );
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const groupId = uuidPattern.test(group.id) ? group.id : crypto.randomUUID();
    await throwOnError(supabase.from('product_option_groups').insert({
      id: groupId,
      catalog_id: activePlatformCatalogId,
      product_id: product.id,
      name: group.name,
      required: group.required,
      min_selected: group.minSelected,
      max_selected: group.maxSelected,
      is_active: group.isActive !== false,
      sort_order: groupIndex
    }));
    await throwOnError(supabase.from('product_options').insert(group.options.map((option, optionIndex) => ({
      id: uuidPattern.test(option.id) ? option.id : crypto.randomUUID(),
      catalog_id: activePlatformCatalogId,
      group_id: groupId,
      name: option.name,
      price_delta: option.priceDelta,
      is_default: option.isDefault,
      is_active: option.isActive !== false,
      sort_order: optionIndex
    }))));
  }
}

const getProductConfig = (product: Partial<Product>) => Object.fromEntries(
  productConfigKeys.flatMap((key) => product[key] === undefined ? [] : [[key, product[key]]])
);

async function saveProductConfig(productId: string, patch: Partial<Product>, remove = false) {
  if (!supabase || !activePlatformCatalogId || !uuidPattern.test(productId)) return;
  const current = await throwOnError(
    supabase
      .from('catalog_sections')
      .select('settings')
      .eq('catalog_id', activePlatformCatalogId)
      .eq('key', 'product-config')
      .maybeSingle()
  ) as { settings?: unknown } | null;
  const settings = current?.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
    ? { ...(current.settings as Record<string, unknown>) }
    : {};
  if (remove) {
    delete settings[productId];
  } else {
    const existing = settings[productId] && typeof settings[productId] === 'object' && !Array.isArray(settings[productId])
      ? settings[productId] as Record<string, unknown>
      : {};
    settings[productId] = { ...existing, ...getProductConfig(patch) };
  }
  await throwOnError(
    supabase.from('catalog_sections').upsert({
      catalog_id: activePlatformCatalogId,
      key: 'product-config',
      title: 'Параметры товаров',
      enabled: Object.keys(settings).length > 0,
      sort_order: 112,
      settings
    }, { onConflict: 'catalog_id,key' })
  );
}

const categoryMeta = (value: Category) =>
  JSON.stringify({
    showOnHome: value.showOnHome !== false,
    showInOrderFlow: value.showInOrderFlow === true,
    kind: value.kind
  });

const productPatchToPlatformRow = (patch: Partial<Product>) => {
  const row: Record<string, unknown> = {};
  if (patch.category_id !== undefined) row.category_id = patch.category_id && uuidPattern.test(patch.category_id) ? patch.category_id : null;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.ingredients !== undefined) row.ingredients = patch.ingredients;
  if (patch.weight !== undefined) row.weight = patch.weight;
  if (patch.serving !== undefined) row.serving = patch.serving;
  if (patch.current_stock !== undefined || patch.stock_count !== undefined || patch.daily_stock !== undefined) {
    row.stock_count = patch.current_stock ?? patch.stock_count ?? patch.daily_stock ?? 0;
  }
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.barcode !== undefined) row.barcode = patch.barcode;
  if (patch.sale_unit !== undefined) row.sale_unit = patch.sale_unit;
  if (patch.quantity_unit !== undefined) row.quantity_unit = patch.quantity_unit;
  if (patch.price_basis_quantity !== undefined) row.price_basis_quantity = patch.price_basis_quantity;
  if (patch.minimum_quantity !== undefined) row.minimum_quantity = patch.minimum_quantity;
  if (patch.quantity_step !== undefined) row.quantity_step = patch.quantity_step;
  if (patch.stock_quantity !== undefined) row.stock_quantity = patch.stock_quantity;
  if (patch.allow_substitution !== undefined) row.allow_substitution = patch.allow_substitution;
  if (patch.is_unlimited !== undefined) row.is_unlimited = patch.is_unlimited;
  if (patch.is_popular !== undefined) row.is_popular = patch.is_popular;
  if (patch.is_new !== undefined) row.is_new = patch.is_new;
  if (patch.is_hit !== undefined) row.is_promo = patch.is_hit;
  if (patch.is_hidden !== undefined) row.status = patch.is_hidden ? 'hidden' : 'active';
  return row;
};

async function syncPlatformProductImages(productId: string, imageUrls: readonly string[]) {
  if (!supabase || !activePlatformCatalogId || !uuidPattern.test(productId)) return;
  await throwOnError(
    supabase.from('product_images').delete().eq('catalog_id', activePlatformCatalogId).eq('product_id', productId)
  );
  const images = imageUrls.filter(Boolean).slice(0, 3);
  if (images.length === 0) return;
  await throwOnError(
    supabase.from('product_images').insert(images.map((url, sortOrder) => ({
      catalog_id: activePlatformCatalogId,
      product_id: productId,
      url,
      alt: '',
      sort_order: sortOrder
    })))
  );
}

export async function saveProductToSupabase(product: Product) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    const row = productToPlatformRow(product);
    if (uuidPattern.test(product.id)) {
      await throwOnError(supabase.from('products').upsert({ id: product.id, ...row }, { onConflict: 'id' }));
      await syncPlatformProductImages(product.id, product.image_urls?.length ? product.image_urls : [product.image_url]);
      await saveProductChoices(product);
      await saveProductModifiers(product);
      await saveProductConfig(product.id, product);
      return;
    }
    const created = (await throwOnError(supabase.from('products').insert(row).select('id').single())) as
      | { id: string }
      | null;
    if (created?.id) {
      const createdProduct = { ...product, id: String(created.id) };
      await syncPlatformProductImages(createdProduct.id, product.image_urls?.length ? product.image_urls : [product.image_url]);
      await saveProductChoices(createdProduct);
      await saveProductModifiers(createdProduct);
      await saveProductConfig(createdProduct.id, createdProduct);
    }
    return;
  }
  const legacyProduct: Record<string, unknown> = { ...product };
  delete legacyProduct.choice_options;
  await throwOnError(supabase.from('product').upsert(legacyProduct, { onConflict: 'id' }));
  await saveProductChoices(product);
}

export async function updateProductInSupabase(productId: string, patch: Partial<Product>) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    if (!uuidPattern.test(productId)) return;
    await throwOnError(supabase.from('products').update(productPatchToPlatformRow(patch)).eq('id', productId).eq('catalog_id', activePlatformCatalogId));
    if (patch.image_url !== undefined || patch.image_urls !== undefined) {
      await syncPlatformProductImages(productId, patch.image_urls?.length ? patch.image_urls : patch.image_url ? [patch.image_url] : []);
    }
    await saveProductConfig(productId, patch);
    return;
  }
  const legacyPatch = { ...patch };
  await throwOnError(supabase.from('product').update(legacyPatch).eq('id', productId));
}

export async function deleteProductFromSupabase(productId: string) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    if (!uuidPattern.test(productId)) return;
    await saveProductConfig(productId, {}, true);
    await throwOnError(supabase.from('products').delete().eq('id', productId).eq('catalog_id', activePlatformCatalogId));
    return;
  }
  await throwOnError(supabase.from('product').delete().eq('id', productId));
}

export async function deleteCategoryFromSupabase(categoryId: string) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    if (!uuidPattern.test(categoryId)) return;
    await throwOnError(supabase.from('categories').delete().eq('id', categoryId).eq('catalog_id', activePlatformCatalogId));
    return;
  }
  await throwOnError(supabase.from('category').delete().eq('id', categoryId));
}

export async function saveRestaurantToSupabase(value: Restaurant) {
  if (!supabase) return;
  const bannerUrls = Array.from(
    new Set([...(value.banner_urls ?? []), value.banner_url].map((url) => url?.trim()).filter(Boolean))
  ).slice(0, 3) as string[];
  const primaryBannerUrl = bannerUrls[0] ?? '';
  const normalizedGalleryRestaurant = {
    ...value,
    banner_url: primaryBannerUrl,
    banner_urls: bannerUrls
  };
  const savePlatformCatalogFields = async (catalogId: string) => {
    await throwOnError(
      supabase
        .from('catalogs')
        .update({
          name: value.name,
          description: value.subtitle,
          logo_url: value.logo_url,
          banner_url: primaryBannerUrl,
          whatsapp: value.whatsapp,
          instagram_url: value.instagram_url,
          address: value.address,
          map_url: value.mapLink
        })
        .eq('id', catalogId)
    );
    await throwOnError(
      supabase.from('catalog_sections').upsert(
        {
          catalog_id: catalogId,
          key: 'restaurant-gallery',
          title: 'Обложки ресторана',
          enabled: bannerUrls.length > 0,
          sort_order: 5,
          settings: { images: bannerUrls }
        },
        { onConflict: 'catalog_id,key' }
      )
    );
    await throwOnError(
      supabase.from('catalog_sections').upsert(
        {
          catalog_id: catalogId,
          key: 'catalog-info',
          title: 'Информация каталога',
          enabled: true,
          sort_order: 6,
          settings: {
            catalog_notice: value.catalog_notice ?? '',
            working_hours: value.working_hours ?? '',
            minimum_order: value.minimum_order ?? 0
          }
        },
        { onConflict: 'catalog_id,key' }
      )
    );
  };

  if (activePlatformCatalogId) {
    await savePlatformCatalogFields(activePlatformCatalogId);
    await savePlatformRestaurantLocation(activePlatformCatalogId, normalizedGalleryRestaurant);
    return;
  }
  const normalizedRestaurant = normalizeRestaurant(normalizedGalleryRestaurant);
  const legacyRestaurant: Omit<Restaurant, 'lat' | 'lng'> = {
    id: normalizedRestaurant.id,
    name: normalizedRestaurant.name,
    subtitle: normalizedRestaurant.subtitle,
    logo_url: normalizedRestaurant.logo_url,
    banner_url: normalizedRestaurant.banner_url,
    whatsapp: normalizedRestaurant.whatsapp,
    instagram_url: normalizedRestaurant.instagram_url,
    address: normalizedRestaurant.address,
    mapLink: normalizedRestaurant.mapLink
  };
  await throwOnError(supabase.from('restaurant').upsert(legacyRestaurant, { onConflict: 'id' }));
  const platformCatalogId = await getPlatformCatalogId(value.id);
  if (platformCatalogId) {
    await savePlatformCatalogFields(platformCatalogId);
    await savePlatformRestaurantLocation(platformCatalogId, normalizedGalleryRestaurant);
  }
}

export async function saveThemeToSupabase(value: ThemeSettings) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    await throwOnError(
      supabase
        .from('catalog_theme_settings')
        .upsert({ catalog_id: activePlatformCatalogId, settings: value }, { onConflict: 'catalog_id' })
    );
    return;
  }
  await throwOnError(supabase.from('theme_settings').upsert(themeToLegacyRow(value), { onConflict: 'id' }));
}

export async function savePhotoQualityToSupabase(catalogSlug: string, value: PhotoQualitySettings) {
  if (!supabase) return;
  const catalogId = activePlatformCatalogId ?? await getPlatformCatalogId(normalizeCatalogSlug(catalogSlug));
  if (!catalogId) throw new Error('Каталог не найден');

  const normalized = normalizePhotoQualitySettings(value);
  const { enabled, ...settings } = normalized;
  await throwOnError(
    supabase.from('catalog_sections').upsert(
      {
        catalog_id: catalogId,
        key: 'photo-quality',
        title: 'Качество фотографий',
        enabled,
        sort_order: 100,
        settings
      },
      { onConflict: 'catalog_id,key' }
    )
  );
}

export async function replaceCategoriesInSupabase(values: Category[], options: { removeMissing?: boolean } = {}) {
  if (!supabase) return values;
  if (activePlatformCatalogId) {
    const slugs = values.map((value) => value.slug || createSlug(value.name || value.id));
    const existingRows = slugs.length > 0
      ? (((await throwOnError(
          supabase.from('categories').select('id, slug').eq('catalog_id', activePlatformCatalogId).in('slug', slugs)
        )) ?? []) as Array<{ id: string; slug: string }>)
      : [];
    const existingIdsBySlug = new Map(existingRows.map((row) => [row.slug, row.id]));
    const rows = values.map((value, index) => ({
      id: uuidPattern.test(value.id) ? value.id : existingIdsBySlug.get(value.slug || createSlug(value.name || value.id)) ?? crypto.randomUUID(),
      catalog_id: activePlatformCatalogId,
      name: value.name,
      slug: value.slug || createSlug(value.name || value.id),
      description: categoryMeta(value),
      image_url: value.image,
      icon: value.icon,
      sort_order: index
    }));
    let savedRows: Array<{ id: string; slug: string }> = [];
    if (rows.length > 0) {
      savedRows = ((await throwOnError(
        supabase.from('categories').upsert(rows, { onConflict: 'catalog_id,slug' }).select('id, slug')
      )) ?? []) as Array<{ id: string; slug: string }>;
      if (options.removeMissing) {
        await throwOnError(
          supabase.from('categories').delete().eq('catalog_id', activePlatformCatalogId).not('slug', 'in', postgrestList(slugs))
        );
      }
    } else if (options.removeMissing) {
      await throwOnError(supabase.from('categories').delete().eq('catalog_id', activePlatformCatalogId));
    }
    if (activeCatalogIsLegacy) {
      const legacyIds = values.map((value) => value.id);
      await throwOnError(
        supabase.from('category').upsert(values.map(categoryToLegacyPersistence), { onConflict: 'id' })
      );
      if (options.removeMissing && legacyIds.length > 0) {
        await throwOnError(supabase.from('category').delete().not('id', 'in', postgrestList(legacyIds)));
      } else if (options.removeMissing) {
        await throwOnError(supabase.from('category').delete().neq('id', ''));
      }
      return values;
    }
    const idsBySlug = new Map(savedRows.map((row) => [row.slug, row.id]));
    return values.map((value) => {
      const slug = value.slug || createSlug(value.name || value.id);
      return { ...value, id: idsBySlug.get(slug) ?? value.id, slug };
    });
  }
  const ids = values.map((value) => value.id);
  await throwOnError(
    supabase.from('category').upsert(values.map(categoryToLegacyPersistence), { onConflict: 'id' })
  );
  if (ids.length > 0) {
    if (options.removeMissing) {
      await throwOnError(supabase.from('category').delete().not('id', 'in', postgrestList(ids)));
    }
  } else if (options.removeMissing) {
    await throwOnError(supabase.from('category').delete().neq('id', ''));
  }
  return values;
}

export async function replaceTagsInSupabase(values: CatalogTag[], options: { removeMissing?: boolean } = {}) {
  if (!supabase) return values;
  if (activePlatformCatalogId) {
    const slugs = values.map((value) => value.slug || createSlug(value.name || value.id));
    const existingRows = slugs.length > 0
      ? (((await throwOnError(
          supabase.from('tags').select('id, slug').eq('catalog_id', activePlatformCatalogId).in('slug', slugs)
        )) ?? []) as Array<{ id: string; slug: string }>)
      : [];
    const existingIdsBySlug = new Map(existingRows.map((row) => [row.slug, row.id]));
    const rows = values.map((value, index) => ({
      id: uuidPattern.test(value.id) ? value.id : existingIdsBySlug.get(value.slug || createSlug(value.name || value.id)) ?? crypto.randomUUID(),
      catalog_id: activePlatformCatalogId,
      name: value.name,
      slug: value.slug || createSlug(value.name || value.id),
      icon: value.icon,
      color: value.color,
      sort_order: index
    }));
    let savedRows: Array<{ id: string; slug: string }> = [];
    if (rows.length > 0) {
      savedRows = ((await throwOnError(
        supabase.from('tags').upsert(rows, { onConflict: 'catalog_id,slug' }).select('id, slug')
      )) ?? []) as Array<{ id: string; slug: string }>;
      if (options.removeMissing) {
        await throwOnError(
          supabase.from('tags').delete().eq('catalog_id', activePlatformCatalogId).not('slug', 'in', postgrestList(slugs))
        );
      }
    } else if (options.removeMissing) {
      await throwOnError(supabase.from('tags').delete().eq('catalog_id', activePlatformCatalogId));
    }
    const idsBySlug = new Map(savedRows.map((row) => [row.slug, row.id]));
    return values.map((value) => {
      const slug = value.slug || createSlug(value.name || value.id);
      return { ...value, id: idsBySlug.get(slug) ?? value.id, slug };
    });
  }
  const ids = values.map((value) => value.id);
  const now = new Date().toISOString();
  await throwOnError(
    supabase
      .from('catalog_tag')
      .upsert(
        values.map((value, index) => {
          const valueWithoutSlug = { ...value };
          delete valueWithoutSlug.slug;

          return {
            ...valueWithoutSlug,
            sort_order: index,
            created_at: value.created_at ?? now,
            updated_at: now
          };
        }),
        { onConflict: 'id' }
      )
  );
  if (ids.length > 0) {
    if (options.removeMissing) {
      await throwOnError(supabase.from('catalog_tag').delete().not('id', 'in', postgrestList(ids)));
    }
  } else if (options.removeMissing) {
    await throwOnError(supabase.from('catalog_tag').delete().neq('id', ''));
  }
  return values;
}

export async function replaceCabinsInSupabase(values: Cabin[]) {
  if (!supabase) return;
  if (activePlatformCatalogId && !activeCatalogIsLegacy) {
    const rows = values.map((value, index) => ({
      ...(uuidPattern.test(value.id) ? { id: value.id } : {}),
      catalog_id: activePlatformCatalogId,
      title: value.title,
      capacity: Number.parseInt(value.capacity, 10) || 1,
      capacity_text: value.capacity,
      image_url: value.image_url,
      is_active: (() => {
        try {
          return (JSON.parse(value.feature || '{}') as { status?: string }).status !== 'inactive';
        } catch {
          return true;
        }
      })(),
      resource_type: parseCabinMeta(value.feature).kind,
      price: parseCabinMeta(value.feature).price,
      sort_order: index
    }));
    if (rows.length > 0) {
      await throwOnError(supabase.from('bookable_resources').upsert(rows, { onConflict: 'id' }));
    }
    return;
  }
  const ids = values.map((value) => value.id);
  await throwOnError(supabase.from('cabin').upsert(values.map((value, index) => ({ ...value, sort_order: index })), { onConflict: 'id' }));
  if (ids.length > 0) {
    await throwOnError(supabase.from('cabin').delete().not('id', 'in', postgrestList(ids)));
  } else {
    await throwOnError(supabase.from('cabin').delete().neq('id', ''));
  }
}

export async function replaceProductsInSupabase(values: Product[]) {
  if (!supabase) return;
  if (activePlatformCatalogId) {
    const rows = values.map((value, index) => ({
      ...(uuidPattern.test(value.id) ? { id: value.id } : {}),
      ...productToPlatformRow(value),
      sort_order: index
    }));
    await throwOnError(supabase.from('products').delete().eq('catalog_id', activePlatformCatalogId));
    if (rows.length > 0) {
      await throwOnError(supabase.from('products').insert(rows));
    }
    return;
  }
  const ids = values.map((value) => value.id);
  if (values.length > 0) {
    await throwOnError(supabase.from('product').upsert(values.map((value, index) => ({ ...value, sort_order: index })), { onConflict: 'id' }));
  }
  if (ids.length > 0) {
    await throwOnError(supabase.from('product').delete().not('id', 'in', postgrestList(ids)));
  } else {
    await throwOnError(supabase.from('product').delete().neq('id', ''));
  }
}

export async function replaceCatalogInSupabase(payload: {
  restaurant?: Restaurant;
  categories?: Category[];
  tags?: CatalogTag[];
  products?: Product[];
  cabins?: Cabin[];
  theme?: ThemeSettings;
}) {
  if (!supabase) return;
  if (payload.restaurant) await saveRestaurantToSupabase(payload.restaurant);
  if (payload.theme) await saveThemeToSupabase(payload.theme);
  if (payload.categories) await replaceCategoriesInSupabase(payload.categories, { removeMissing: true });
  if (payload.tags) await replaceTagsInSupabase(payload.tags, { removeMissing: true });
  if (payload.cabins) {
    await replaceCabinsInSupabase(payload.cabins);
  }
  if (payload.products) {
    await replaceProductsInSupabase(payload.products);
  }
}
