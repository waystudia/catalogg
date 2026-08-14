import {
  buildClientDeliveryComment,
  buildClientReviewPayload,
  resolveCheckoutSettlement,
  summarizeRestaurantReviews
} from '../../features/client-platform/clientPlatformLogic';
import { fallbackPaymentSettings } from '../../features/client-platform/mockData';
import type {
  ClientCity,
  ClientCartLine,
  ClientCheckoutDraft,
  ClientDeliveryProvider,
  ClientDish,
  ClientOrderType,
  ClientPaymentMethod,
  ClientPaymentStatus,
  ClientPlatformCategory,
  ClientPlatformSnapshot,
  ClientProfile,
  ClientRestaurant,
  ClientRestaurantCategory,
  ClientRestaurantReview,
  PaymentSettings,
  PlatformBanner,
  PlatformContentPage,
  RestaurantTheme
} from '../../features/client-platform/types';
import { isPublicMenuCategory } from '../../entities/publicCategoryVisibility';
import { normalizePhotoQualitySettings } from '../photoQuality';
import { normalizeBusinessType } from '../businessTerminology';
import { supabase } from '../supabase';
import { buildClientOrderItems, resolveClientOrderRpcName } from './clientPlatformOrderPayload';
import { getStoredClientSessionToken } from './clientAccountApi';

type CatalogRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  status: 'draft' | 'published' | 'archived';
  business_type: string | null;
};

type RestaurantProfileRow = {
  catalog_id: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
};

type ClientReviewRow = {
  id: string;
  restaurant_id: string;
  client_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

type CategoryRow = {
  id: string;
  catalog_id: string;
  slug: string;
  name: string;
  image_url: string;
  is_hidden: boolean;
  sort_order: number;
};

type ProductRow = {
  id: string;
  catalog_id: string;
  category_id: string | null;
  title: string;
  status: 'draft' | 'active' | 'hidden' | 'sold_out' | 'archived';
  price: number;
  old_price: number | null;
  description: string;
  weight: string;
  stock_count: number;
  stock_quantity: number;
  is_unlimited: boolean;
  sale_unit: 'piece' | 'weight';
  quantity_unit: 'piece' | 'gram';
  price_basis_quantity: number;
  minimum_quantity: number;
  quantity_step: number;
  allow_substitution: boolean;
  sku: string;
  barcode: string;
  is_popular: boolean;
};

type LegacyCategoryRow = {
  id: string;
  name: string;
  image: string;
  icon: string;
  kind: string;
  sort_order: number;
};

type LegacyProductRow = {
  id: string;
  category_id: string;
  title: string;
  price: number;
  description: string;
  image_url: string;
  weight: string;
  stock_count: number;
  current_stock: number | null;
  is_popular: boolean;
  is_hidden: boolean;
  is_unlimited: boolean | null;
  sort_order: number;
};

type LegacyRestaurantRow = {
  id: string;
  banner_url: string | null;
};

type ProductImageRow = {
  product_id: string;
  url: string;
  sort_order: number;
};

type ThemeRow = {
  catalog_id: string;
  settings: Partial<{
    background_color: string;
    card_color: string;
    text_primary: string;
    text_secondary: string;
    accent_color: string;
    button_style: string;
  }> | null;
};

type PhotoQualityRow = {
  catalog_id: string;
  enabled: boolean;
  settings: Record<string, unknown> | null;
};

type DeliverySettingsRow = {
  catalog_id: string;
  enable_delivery: boolean;
  enable_pickup: boolean;
  enable_hall_orders: boolean;
  use_own_courier: boolean;
  use_platform_drivers: boolean;
  minimum_order_amount: number;
  free_delivery_from: number;
  default_preparation_minutes: number;
  primary_city: string;
  service_settlements: string[] | null;
};

type PaymentRow = {
  restaurant_id: string;
  enable_transfer: boolean;
  allow_cash: boolean;
  require_confirmation: boolean;
  bank_name: string;
  phone_number: string;
  display_name: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  comment: string;
  qr_image_url: string;
};

type PlatformBannerRow = {
  id: string;
  title: string;
  subtitle: string;
  kind: PlatformBanner['kind'];
  image_url: string;
  background_color: string;
  link_url: string;
  page_id?: string | null;
  platform_content_pages?: { slug?: string | null } | Array<{ slug?: string | null }> | null;
  action_label: string;
  content_position?: PlatformBanner['contentPosition'] | null;
  button_position?: PlatformBanner['buttonPosition'] | null;
  display_duration_ms?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  sort_order: number;
};

type PlatformSettingsRow = {
  support_whatsapp: string;
  support_phone?: string;
  support_email?: string;
  support_telegram?: string;
  support_hours?: string;
  support_hint?: string;
};

type PlatformContentPageRow = {
  id: string;
  name: string;
  slug: string;
  blocks: PlatformContentPage['blocks'];
};

type DeliverySettlementRow = {
  city_name: string;
  settlement_name: string;
  is_active: boolean | null;
};

const transliteration: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ъ: '',
  ь: ''
};

const slugifyCity = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase('ru-RU');
  const transliterated = Array.from(normalized)
    .map((letter) => transliteration[letter] ?? letter)
    .join('');

  return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grozny';
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const fallbackCityName = 'Грозный';

const getCityId = (value?: string | null) => slugifyCity(value?.trim() || fallbackCityName);

export const getClientCityId = getCityId;

const createTheme = (theme?: ThemeRow['settings']): RestaurantTheme => ({
  accentColor: theme?.accent_color ?? '#067a46',
  backgroundColor: theme?.background_color ?? '#f7fbf8',
  buttonColor: theme?.accent_color ?? '#067a46',
  buttonTextColor: '#ffffff',
  cardColor: theme?.card_color ?? '#ffffff',
  textColor: theme?.text_primary ?? '#111827',
  mutedTextColor: theme?.text_secondary ?? '#667085'
});

const getProvider = (settings?: DeliverySettingsRow): ClientDeliveryProvider => {
  if (!settings?.enable_delivery) return settings?.enable_pickup ? 'pickup' : 'dine_in';
  if (settings.use_platform_drivers) return 'platform';
  return 'restaurant';
};

const getOrderTypes = (settings?: DeliverySettingsRow): ClientOrderType[] => {
  const orderTypes: ClientOrderType[] = [];
  if (settings?.enable_hall_orders) orderTypes.push('dine_in');
  if (settings?.enable_pickup ?? true) orderTypes.push('pickup');
  if (settings?.enable_delivery) orderTypes.push('delivery');
  return orderTypes.length > 0 ? orderTypes : ['pickup'];
};

const mapLegacyCategoryToPlatformCategory = (catalogId: string, category: LegacyCategoryRow): CategoryRow => ({
  id: category.id,
  catalog_id: catalogId,
  slug: category.id,
  name: category.name,
  image_url: category.image,
  is_hidden: category.kind === 'space',
  sort_order: category.sort_order
});

const mapLegacyProductToPlatformProduct = (catalogId: string, product: LegacyProductRow): ProductRow => {
  const stockCount = product.current_stock ?? product.stock_count;

  return {
    id: product.id,
    catalog_id: catalogId,
    category_id: product.category_id,
    title: product.title,
    status: product.is_hidden ? 'hidden' : stockCount <= 0 && !product.is_unlimited ? 'sold_out' : 'active',
    price: product.price,
    old_price: null,
    description: product.description,
    weight: product.weight,
    stock_count: stockCount,
    stock_quantity: stockCount,
    is_unlimited: product.is_unlimited ?? false,
    sale_unit: 'piece',
    quantity_unit: 'piece',
    price_basis_quantity: 1,
    minimum_quantity: 1,
    quantity_step: 1,
    allow_substitution: false,
    sku: '',
    barcode: '',
    is_popular: product.is_popular
  };
};

const mapPaymentSettings = (row: PaymentRow | undefined, restaurantSlug: string): PaymentSettings => ({
  restaurantSlug,
  enableQr: Boolean(row?.qr_image_url),
  enableBankTransfer: row?.enable_transfer ?? fallbackPaymentSettings.enableBankTransfer,
  enableCash: row?.allow_cash ?? fallbackPaymentSettings.enableCash,
  bankName: row?.bank_name ?? fallbackPaymentSettings.bankName,
  recipientFullName:
    row?.display_name ||
    [row?.last_name, row?.first_name, row?.middle_name].filter(Boolean).join(' ') ||
    fallbackPaymentSettings.recipientFullName,
  recipientPhone: row?.phone_number ?? fallbackPaymentSettings.recipientPhone,
  paymentComment: row?.comment ?? fallbackPaymentSettings.paymentComment,
  qrImageUrl: row?.qr_image_url ?? fallbackPaymentSettings.qrImageUrl,
  requireManualConfirmation: row?.require_confirmation ?? fallbackPaymentSettings.requireManualConfirmation
});

export async function saveClientSignup(profile: ClientProfile) {
  const name = profile.name.trim();
  const phone = profile.phone.trim();

  if (!name || !phone) {
    throw new Error('Введите имя и номер телефона.');
  }

  if (!supabase) return;

  const { error } = await supabase.from('client_signups').insert({
    name,
    phone,
    source: 'client_profile'
  });

  if (error) throw error;
}

export async function saveClientReview(input: {
  orderId: string;
  restaurantId: string;
  clientName: string;
  clientPhone: string;
  rating: number;
  comment: string;
}) {
  const review = buildClientReviewPayload(input);
  const sessionToken = getStoredClientSessionToken();

  if (!supabase) return;
  if (!sessionToken) throw new Error('Войдите в аккаунт клиента, чтобы оставить отзыв.');

  const { error } = await supabase.rpc('submit_client_review', {
    client_session_token: sessionToken,
    target_order_id: input.orderId,
    target_rating: review.rating,
    target_comment: review.comment
  });

  if (!error) return;
  const message = error.message.toLowerCase();
  if (message.includes('client_review_auth_required')) {
    throw new Error('Сессия закончилась. Войдите в аккаунт клиента ещё раз.');
  }
  if (message.includes('client_review_order_forbidden')) {
    throw new Error('Оставить отзыв может только клиент, оформивший этот заказ.');
  }
  if (message.includes('client_review_order_not_found')) {
    throw new Error('Заказ не найден. Обновите страницу и попробуйте ещё раз.');
  }
  if (message.includes('client_review_comment_invalid')) {
    throw new Error('Напишите отзыв длиной от 2 до 2000 символов.');
  }
  throw error;
}

type ClientPlatformOrderInput = {
  restaurant: Pick<ClientRestaurant, 'slug' | 'description' | 'addressLine' | 'lat' | 'lng' | 'deliveryProvider' | 'businessType'>;
  profile: ClientProfile;
  draft: ClientCheckoutDraft;
  lines: ClientCartLine[];
  dishes: ClientDish[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  idempotencyKey?: string;
};

const fulfillmentTypeByOrderType: Record<ClientOrderType, 'hall' | 'takeaway' | 'delivery'> = {
  dine_in: 'hall',
  pickup: 'takeaway',
  delivery: 'delivery'
};

const errorText = (error: unknown) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return [value.code, value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  return '';
};

const rpcIsMissing = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  return text.includes('pgrst202') || text.includes('could not find the function') || text.includes('function not found');
};

const rpcShouldRetryWithoutIdempotencyKey = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  return rpcIsMissing(error) || (text.includes('42702') && text.includes('idempotency_key') && text.includes('ambiguous'));
};

export async function createClientPlatformOrder(input: ClientPlatformOrderInput): Promise<string | null> {
  if (!supabase) return null;

  const catalogResult = await supabase
    .from('catalogs')
    .select('id')
    .eq('slug', input.restaurant.slug)
    .maybeSingle();

  if (catalogResult.error) throw catalogResult.error;
  const catalogId = catalogResult.data?.id as string | undefined;
  if (!catalogId) return null;

  const items = buildClientOrderItems(input.lines, input.dishes);
  if (items.length === 0) return null;

  const clientName = (input.draft.clientName || input.profile.name).trim();
  const clientPhone = (input.draft.clientPhone || input.profile.phone).trim();
  const deliverySettlement = input.draft.orderType === 'delivery'
    ? resolveCheckoutSettlement('', input.draft.deliverySettlement)
    : '';
  const deliveryCity = deliverySettlement;
  const addressComment = input.draft.orderType === 'delivery' ? input.draft.deliveryComment : '';
  const deliveryComment = buildClientDeliveryComment({
    comment: addressComment,
    orderType: input.draft.orderType,
    lat: input.draft.deliveryLat,
    lng: input.draft.deliveryLng,
    accuracyM: input.draft.deliveryAccuracyM
  });

  const rpcName = resolveClientOrderRpcName(items, input.restaurant.businessType);
  const rpcArgs = {
    target_catalog_id: catalogId,
    customer_name: clientName,
    customer_phone: clientPhone,
    fulfillment_type: fulfillmentTypeByOrderType[input.draft.orderType],
    cabin_label: input.draft.orderType === 'dine_in' ? input.draft.boothName : '',
    delivery_address: input.draft.orderType === 'delivery' ? input.draft.deliveryAddress : '',
    delivery_city: deliveryCity,
    delivery_settlement: deliverySettlement,
    client_address_comment: deliveryComment,
    comment: deliveryComment,
    idempotency_key: input.idempotencyKey?.trim() || null,
    payment_method: input.draft.paymentMethod,
    items
  };
  let { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error && rpcArgs.idempotency_key && rpcShouldRetryWithoutIdempotencyKey(error)) {
    const argsWithoutIdempotencyKey: Record<string, unknown> = { ...rpcArgs };
    delete argsWithoutIdempotencyKey.idempotency_key;
    const retryResult = await supabase.rpc(rpcName, argsWithoutIdempotencyKey);
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) throw error;
  const orderId = String(data);
  return orderId;
}

export type ClientOrderRealtimePatch = {
  readonly id: string;
  readonly status?: string;
  readonly deliveryStatus?: string;
  readonly paymentStatus?: ClientPaymentStatus;
  readonly driverName?: string;
  readonly driverPhone?: string;
  readonly driverLat?: number | null;
  readonly driverLng?: number | null;
  readonly driverLocationAt?: string | null;
};

export function subscribeClientOrderRealtime(orderId: string, onChange: (patch: ClientOrderRealtimePatch) => void) {
  const client = supabase;
  if (!client) return () => undefined;

  const fetchOrder = async () => {
    const { data: statusData, error: statusError } = await client.rpc('get_public_restaurant_order_status', {
      target_order_id: orderId
    });
    if (statusError || !statusData || typeof statusData !== 'object') return;
    const status = statusData as {
      id?: unknown;
      status?: unknown;
      delivery_status?: unknown;
      payment_status?: unknown;
      driver_name?: unknown;
      driver_phone?: unknown;
    };
    const { data: trackingData } = await client.rpc('get_public_order_tracking', {
      target_order_id: orderId
    });
    const tracking = trackingData && typeof trackingData === 'object'
      ? trackingData as {
          driver_lat?: number | null;
          driver_lng?: number | null;
          driver_location_at?: string | null;
        }
      : null;

    onChange({
      id: String(status.id ?? orderId),
      status: String(status.status ?? 'new'),
      deliveryStatus: status.delivery_status ? String(status.delivery_status) : undefined,
      paymentStatus: status.payment_status as ClientPaymentStatus,
      driverName: status.driver_name ? String(status.driver_name) : undefined,
      driverPhone: status.driver_phone ? String(status.driver_phone) : undefined,
      driverLat: tracking?.driver_lat ?? null,
      driverLng: tracking?.driver_lng ?? null,
      driverLocationAt: tracking?.driver_location_at ?? null
    });
  };

  void fetchOrder();

  const channel = client
    .channel(`client-order-${orderId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, fetchOrder)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `order_id=eq.${orderId}` }, fetchOrder)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, fetchOrder)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeClientPlatformSnapshotRealtime(onChange: () => void) {
  const client = supabase;
  if (!client) return () => undefined;

  const channel = client
    .channel('client-platform-snapshot')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'catalogs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_sections' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_delivery_settings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'client_reviews' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_banners' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_content_pages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_settings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_settlements' }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function getClientPlatformSnapshot(): Promise<ClientPlatformSnapshot> {
  if (!supabase) {
    return {
      cities: [],
      categories: [],
      restaurants: [],
      reviews: [],
      restaurantCategories: [],
      dishes: [],
      paymentSettings: [],
      banners: [],
      contentPages: [],
      supportWhatsapp: '',
      supportPhone: '',
      supportEmail: '',
      supportTelegram: '',
      supportHours: '',
      supportHint: ''
    };
  }

  const catalogsResult = await supabase
    .from('catalogs')
    .select('id, slug, name, description, logo_url, banner_url, status, business_type')
    .eq('status', 'published')
    .order('name');

  if (catalogsResult.error) throw catalogsResult.error;
  if (!catalogsResult.data?.length) {
    return {
      cities: [],
      categories: [],
      restaurants: [],
      reviews: [],
      restaurantCategories: [],
      dishes: [],
      paymentSettings: [],
      banners: [],
      contentPages: [],
      supportWhatsapp: '',
      supportPhone: '',
      supportEmail: '',
      supportTelegram: '',
      supportHours: '',
      supportHint: ''
    };
  }

  const catalogs = catalogsResult.data as CatalogRow[];
  const catalogIds = catalogs.map((catalog) => catalog.id);

  const [
    categoriesResult,
    productsResult,
    productImagesResult,
    themeResult,
    photoQualityResult,
    deliveryResult,
    paymentsResult,
    restaurantProfilesResult,
    reviewsResult,
    bannersResult,
    contentPagesResult,
    settingsResult,
    deliverySettlementsResult,
    legacyRestaurantsResult
  ] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id, catalog_id, slug, name, image_url, is_hidden, sort_order')
        .in('catalog_id', catalogIds)
        .order('sort_order'),
      supabase
        .from('products')
        .select('id, catalog_id, category_id, title, status, price, old_price, description, weight, stock_count, stock_quantity, is_unlimited, sale_unit, quantity_unit, price_basis_quantity, minimum_quantity, quantity_step, allow_substitution, sku, barcode, is_popular')
        .in('catalog_id', catalogIds)
        .in('status', ['active', 'sold_out'])
        .order('sort_order'),
      supabase
        .from('product_images')
        .select('product_id, url, sort_order')
        .in('catalog_id', catalogIds)
        .order('sort_order'),
      supabase.from('catalog_theme_settings').select('catalog_id, settings').in('catalog_id', catalogIds),
      supabase
        .from('catalog_sections')
        .select('catalog_id, enabled, settings')
        .in('catalog_id', catalogIds)
        .eq('key', 'photo-quality'),
      supabase
        .from('restaurant_delivery_settings')
        .select('catalog_id, enable_delivery, enable_pickup, enable_hall_orders, use_own_courier, use_platform_drivers, minimum_order_amount, free_delivery_from, default_preparation_minutes, primary_city, service_settlements')
        .in('catalog_id', catalogIds),
      supabase
        .from('restaurant_payments')
        .select('restaurant_id, enable_transfer, allow_cash, require_confirmation, bank_name, phone_number, display_name, first_name, last_name, middle_name, comment, qr_image_url')
        .in('restaurant_id', catalogIds),
      supabase
        .from('restaurants')
        .select('catalog_id, address_line, lat, lng')
        .in('catalog_id', catalogIds),
      supabase
        .from('client_reviews')
        .select('id, restaurant_id, client_name, rating, comment, created_at')
        .in('restaurant_id', catalogIds)
        .eq('target_type', 'restaurant')
        .eq('is_visible', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('platform_banners')
        .select('id, title, subtitle, kind, image_url, background_color, link_url, page_id, action_label, content_position, button_position, display_duration_ms, starts_at, ends_at, is_active, sort_order, platform_content_pages(slug)')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('platform_content_pages')
        .select('id, name, slug, blocks')
        .eq('status', 'published')
        .order('updated_at', { ascending: false }),
      supabase
        .from('platform_settings')
        .select('support_whatsapp, support_phone, support_email, support_telegram, support_hours, support_hint')
        .eq('id', 'global')
        .maybeSingle(),
      supabase
        .from('delivery_settlements')
        .select('city_name, settlement_name, is_active')
        .eq('is_active', true)
        .order('city_name', { ascending: true })
        .order('settlement_name', { ascending: true }),
      supabase.from('restaurant').select('id, banner_url')
    ]);

  let categories = (categoriesResult.data ?? []) as CategoryRow[];
  let products = (productsResult.data ?? []) as ProductRow[];
  const productImages = (productImagesResult.data ?? []) as ProductImageRow[];
  const themes = (themeResult.data ?? []) as ThemeRow[];
  const photoQualityRows = (photoQualityResult.data ?? []) as PhotoQualityRow[];
  const deliverySettings = (deliveryResult.data ?? []) as DeliverySettingsRow[];
  const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
  const restaurantProfiles = (restaurantProfilesResult.data ?? []) as RestaurantProfileRow[];
  if (reviewsResult.error) throw reviewsResult.error;
  const reviews: ClientRestaurantReview[] = ((reviewsResult.data ?? []) as ClientReviewRow[]).map((review) => ({
    id: review.id,
    restaurantId: review.restaurant_id,
    clientName: review.client_name,
    rating: Number(review.rating),
    comment: review.comment,
    createdAt: review.created_at
  }));
  const legacyBannersResult = bannersResult.error
    ? await supabase
      .from('platform_banners')
      .select('id, title, subtitle, kind, image_url, background_color, link_url, action_label, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    : null;
  const legacySettingsResult = settingsResult.error
    ? await supabase.from('platform_settings').select('support_whatsapp').eq('id', 'global').maybeSingle()
    : null;
  const bannerRows = (bannersResult.data ?? legacyBannersResult?.data ?? []) as PlatformBannerRow[];
  const contentPageRows = (contentPagesResult.data ?? []) as PlatformContentPageRow[];
  const settingsRow = (settingsResult.data ?? legacySettingsResult?.data) as PlatformSettingsRow | null;
  const deliverySettlementRows = deliverySettlementsResult.error
    ? []
    : ((deliverySettlementsResult.data ?? []) as DeliverySettlementRow[]);
  const legacyRestaurantBannerBySlug = new Map(
    ((legacyRestaurantsResult.data ?? []) as LegacyRestaurantRow[])
      .filter((restaurant) => Boolean(restaurant.banner_url))
      .map((restaurant) => [restaurant.id, restaurant.banner_url ?? ''])
  );

  const mangalCatalog = catalogs.find((catalog) => catalog.slug === 'mangal');
  if (mangalCatalog) {
    const mangalCategoriesAreEmpty = !categories.some((category) => category.catalog_id === mangalCatalog.id);
    const mangalProductsAreEmpty = !products.some((product) => product.catalog_id === mangalCatalog.id);

    if (mangalCategoriesAreEmpty || mangalProductsAreEmpty) {
      const [legacyCategoriesResult, legacyProductsResult] = await Promise.all([
        supabase
          .from('category')
          .select('id, name, image, icon, kind, sort_order')
          .order('sort_order', { ascending: true })
          .order('name'),
        supabase
          .from('product')
          .select('id, category_id, title, price, description, image_url, weight, stock_count, current_stock, is_popular, is_hidden, is_unlimited, sort_order')
          .order('sort_order', { ascending: true })
          .order('title')
      ]);

      if (mangalCategoriesAreEmpty) {
        categories = [
          ...categories,
          ...((legacyCategoriesResult.data ?? []) as LegacyCategoryRow[]).map((category) =>
            mapLegacyCategoryToPlatformCategory(mangalCatalog.id, category)
          )
        ];
      }

      if (mangalProductsAreEmpty) {
        const legacyProducts = ((legacyProductsResult.data ?? []) as LegacyProductRow[]).filter(
          (product) => !product.is_hidden
        );
        products = [
          ...products,
          ...legacyProducts.map((product) => mapLegacyProductToPlatformProduct(mangalCatalog.id, product))
        ];
        legacyProducts.forEach((product) => {
          if (product.image_url) {
            productImages.push({ product_id: product.id, url: product.image_url, sort_order: product.sort_order });
          }
        });
      }
    }
  }

  const publicCategories = categories.filter(
    (category) => !category.is_hidden && isPublicMenuCategory(category)
  );
  const categoriesByCatalog = new Map<string, CategoryRow[]>();
  publicCategories
    .forEach((category) => {
      categoriesByCatalog.set(category.catalog_id, [...(categoriesByCatalog.get(category.catalog_id) ?? []), category]);
    });

  const categoryById = new Map(publicCategories.map((category) => [category.id, category]));
  const firstImageByProductId = new Map<string, string>();
  productImages.forEach((image) => {
    if (!firstImageByProductId.has(image.product_id)) {
      firstImageByProductId.set(image.product_id, image.url);
    }
  });

  const themeByCatalog = new Map(themes.map((theme) => [theme.catalog_id, theme.settings]));
  const photoQualityByCatalog = new Map(
    photoQualityRows.map((row) => [
      row.catalog_id,
      normalizePhotoQualitySettings({ ...row.settings, enabled: row.enabled })
    ])
  );
  const deliveryByCatalog = new Map(deliverySettings.map((settings) => [settings.catalog_id, settings]));
  const paymentByCatalog = new Map(paymentRows.map((payment) => [payment.restaurant_id, payment]));
  const restaurantProfileByCatalog = new Map(
    restaurantProfiles
      .filter((profile): profile is RestaurantProfileRow & { catalog_id: string } => Boolean(profile.catalog_id))
      .map((profile) => [profile.catalog_id, profile])
  );

  const platformCategories: ClientPlatformCategory[] = unique(
    publicCategories.map((category) => category.slug)
  ).map((slug) => {
    const category = publicCategories.find((item) => item.slug === slug);
    return {
      id: `platform-${slug}`,
      slug,
      name: category?.name ?? slug,
      imageUrl: category?.image_url || firstImageByProductId.get(products.find((product) => categoryById.get(product.category_id ?? '')?.slug === slug)?.id ?? '') || '',
      isActive: true
    };
  });

  const approvedSettlementNames = deliverySettlementRows.flatMap((settlement) => [
    settlement.city_name,
    settlement.settlement_name
  ]);
  const configuredRestaurantSettlements = deliverySettings.flatMap((settings) => [
    settings.primary_city,
    ...(settings.service_settlements ?? [])
  ]);
  const cityNames = unique(
    (approvedSettlementNames.length > 0 ? approvedSettlementNames : configuredRestaurantSettlements)
      .map((name) => name.trim())
      .filter(Boolean)
  );
  const cities: ClientCity[] = cityNames.map((name) => ({
    id: getCityId(name),
    slug: getCityId(name),
    name,
    region: '',
    isActive: true
  }));

  const restaurants: ClientRestaurant[] = catalogs.map((catalog) => {
    const settings = deliveryByCatalog.get(catalog.id);
    const restaurantProfile = restaurantProfileByCatalog.get(catalog.id);
    const catalogCategories = categoriesByCatalog.get(catalog.id) ?? [];
    const serviceSettlements = settings?.service_settlements ?? [];
    const preparation = Math.max(10, settings?.default_preparation_minutes ?? 30);
    const reviewSummary = summarizeRestaurantReviews(
      reviews.filter((review) => review.restaurantId === catalog.id)
    );

    return {
      id: catalog.id,
      slug: catalog.slug,
      name: catalog.name,
      description: catalog.description,
      addressLine: restaurantProfile?.address_line ?? catalog.description,
      lat: restaurantProfile?.lat ?? null,
      lng: restaurantProfile?.lng ?? null,
      cityId: getCityId(settings?.primary_city),
      serviceCityIds: serviceSettlements.map(getCityId),
      categorySlugs: unique(catalogCategories.map((category) => category.slug)),
      logoUrl: catalog.logo_url,
      coverUrl: catalog.banner_url || legacyRestaurantBannerBySlug.get(catalog.slug) || catalogCategories.find((category) => category.image_url)?.image_url || '',
      rating: reviewSummary.rating,
      reviewCount: reviewSummary.reviewCount,
      minOrderAmount: settings?.minimum_order_amount ?? 0,
      freeDeliveryFrom: settings?.free_delivery_from ?? 0,
      deliveryTimeFrom: preparation,
      deliveryTimeTo: preparation + 10,
      deliveryProvider: getProvider(settings),
      theme: createTheme(themeByCatalog.get(catalog.id)),
      orderTypes: getOrderTypes(settings),
      paymentMethods: [
        paymentByCatalog.get(catalog.id)?.qr_image_url ? 'qr' : undefined,
        paymentByCatalog.get(catalog.id)?.enable_transfer === false ? undefined : 'bank_transfer',
        paymentByCatalog.get(catalog.id)?.allow_cash === false ? undefined : 'cash'
      ].filter((method): method is ClientPaymentMethod => Boolean(method)),
      publicPath: `/${catalog.slug}`,
      businessType: normalizeBusinessType(catalog.business_type)
    };
  });

  const restaurantCategories: ClientRestaurantCategory[] = publicCategories
    .flatMap((category) => {
      const catalog = catalogs.find((item) => item.id === category.catalog_id);
      if (!catalog) return [];
      return [{
        id: category.id,
        restaurantSlug: catalog.slug,
        slug: category.slug,
        name: category.name,
        imageUrl: category.image_url,
        sortOrder: category.sort_order
      }];
    });

  const dishes: ClientDish[] = products.flatMap((product) => {
    const catalog = catalogs.find((item) => item.id === product.catalog_id);
    const category = product.category_id ? categoryById.get(product.category_id) : undefined;
    if (!catalog || !category) return [];
    return [{
      id: product.id,
      restaurantSlug: catalog.slug,
      categorySlug: category.slug,
      name: product.title,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      imageUrl: firstImageByProductId.get(product.id) ?? '',
      tags: product.status === 'sold_out' ? ['Нет в наличии'] : product.is_popular ? ['Популярное'] : [],
      isPopular: product.is_popular,
      isAvailable: product.status !== 'sold_out',
      stockCount: product.stock_count,
      stockQuantity: product.stock_quantity,
      isUnlimited: product.is_unlimited,
      saleUnit: product.sale_unit,
      quantityUnit: product.quantity_unit,
      priceBasisQuantity: product.price_basis_quantity,
      minimumQuantity: product.minimum_quantity,
      quantityStep: product.quantity_step,
      allowSubstitution: product.allow_substitution,
      sku: product.sku,
      barcode: product.barcode,
      weight: product.weight,
      photoQuality: photoQualityByCatalog.get(product.catalog_id)
    }];
  });

  return {
    cities,
    categories: platformCategories,
    restaurants,
    reviews,
    restaurantCategories,
    dishes,
    paymentSettings: restaurants.map((restaurant) =>
      mapPaymentSettings(paymentByCatalog.get(restaurant.id), restaurant.slug)
    ),
    banners: bannerRows.length > 0
      ? bannerRows.filter((banner) => {
          const now = Date.now();
          return (!banner.starts_at || Date.parse(banner.starts_at) <= now)
            && (!banner.ends_at || Date.parse(banner.ends_at) >= now);
        }).map((banner) => {
          const relatedPage = Array.isArray(banner.platform_content_pages)
            ? banner.platform_content_pages[0]
            : banner.platform_content_pages;
          return {
          id: banner.id,
          title: banner.title,
          subtitle: banner.subtitle,
          kind: banner.kind,
          imageUrl: banner.image_url,
          backgroundColor: banner.background_color || '#5b3df4',
          linkUrl: relatedPage?.slug ? `/pages/${relatedPage.slug}` : banner.link_url,
          pageId: banner.page_id ?? null,
          actionLabel: banner.action_label || 'Заказать',
          contentPosition: banner.content_position ?? 'top-left',
          buttonPosition: banner.button_position ?? 'bottom-left',
          displayDurationMs: Number(banner.display_duration_ms ?? 5000),
          isActive: banner.is_active
          };
        })
      : [],
    contentPages: contentPageRows.map((page) => ({
      id: page.id,
      name: page.name,
      slug: page.slug,
      blocks: Array.isArray(page.blocks) ? page.blocks : []
    })),
    supportWhatsapp: settingsRow?.support_whatsapp || '',
    supportPhone: settingsRow?.support_phone || '',
    supportEmail: settingsRow?.support_email || '',
    supportTelegram: settingsRow?.support_telegram || '',
    supportHours: settingsRow?.support_hours || '',
    supportHint: settingsRow?.support_hint || ''
  };
}
