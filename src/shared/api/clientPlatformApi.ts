import { buildClientReviewPayload } from '../../features/client-platform/clientPlatformLogic';
import { clientPlatformSnapshot, fallbackPaymentSettings } from '../../features/client-platform/mockData';
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
  PaymentSettings,
  PlatformBanner,
  RestaurantTheme
} from '../../features/client-platform/types';
import { supabase } from '../supabase';

type CatalogRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  status: 'draft' | 'published' | 'archived';
};

type RestaurantProfileRow = {
  catalog_id: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
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
  description: string;
  weight: string;
  stock_count: number;
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
  link_url: string;
  is_active: boolean;
  sort_order: number;
};

type PlatformSettingsRow = {
  support_whatsapp: string;
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const getCityId = (value?: string | null) => slugifyCity(value?.trim() || fallbackCityName);

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
    description: product.description,
    weight: product.weight,
    stock_count: stockCount,
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
  restaurantId: string;
  clientName: string;
  clientPhone: string;
  rating: number;
  comment: string;
}) {
  const review = buildClientReviewPayload(input);

  if (!supabase) return;

  const { error } = await supabase.from('client_reviews').insert({
    target_type: 'restaurant',
    restaurant_id: review.restaurantId,
    client_name: review.clientName,
    client_phone: review.clientPhone,
    rating: review.rating,
    comment: review.comment
  });

  if (error) throw error;
}

type ClientPlatformOrderInput = {
  restaurant: Pick<ClientRestaurant, 'slug' | 'description' | 'addressLine' | 'lat' | 'lng' | 'deliveryProvider'>;
  profile: ClientProfile;
  draft: ClientCheckoutDraft;
  lines: ClientCartLine[];
  dishes: ClientDish[];
  subtotal: number;
  deliveryFee: number;
  total: number;
};

type PublicOrderItemPayload = {
  readonly product_id: string;
  readonly quantity: number;
  readonly options: readonly [];
};

const buildClientOrderItems = (lines: ClientCartLine[]): PublicOrderItemPayload[] =>
  lines.map((line) => ({
    product_id: line.dishId,
    quantity: Math.max(1, line.quantity),
    options: []
  }));

const resolveClientOrderRpcName = (items: readonly PublicOrderItemPayload[]) =>
  items.every((item) => uuidPattern.test(item.product_id))
    ? 'create_public_restaurant_order'
    : 'create_legacy_public_restaurant_order';

const fulfillmentTypeByOrderType: Record<ClientOrderType, 'hall' | 'takeaway' | 'delivery'> = {
  dine_in: 'hall',
  pickup: 'takeaway',
  delivery: 'delivery'
};

const deliveryProviderForOrder = (
  orderType: ClientOrderType,
  restaurantProvider: ClientDeliveryProvider
): ClientDeliveryProvider => {
  if (orderType === 'dine_in') return 'dine_in';
  if (orderType === 'pickup') return 'pickup';
  return restaurantProvider;
};

const initialPaymentStatus = (
  orderType: ClientOrderType,
  paymentMethod: ClientPaymentMethod
): ClientPaymentStatus => {
  if (paymentMethod === 'cash') return 'unpaid';
  if (orderType === 'delivery') return 'waiting_confirmation';
  return 'waiting_confirmation';
};

const initialOrderStatus = (orderType: ClientOrderType, paymentMethod: ClientPaymentMethod) => {
  if (orderType === 'delivery' && paymentMethod !== 'cash') return 'waiting_payment_confirmation';
  return 'new';
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

  const items = buildClientOrderItems(input.lines);
  if (items.length === 0) return null;

  const clientName = (input.draft.clientName || input.profile.name).trim();
  const clientPhone = (input.draft.clientPhone || input.profile.phone).trim();
  const deliveryCity = input.draft.orderType === 'delivery' ? '' : '';
  const deliverySettlement = '';
  const addressComment = input.draft.orderType === 'delivery' ? input.draft.deliveryComment : '';

  const { data, error } = await supabase.rpc(resolveClientOrderRpcName(items), {
    target_catalog_id: catalogId,
    customer_name: clientName,
    customer_phone: clientPhone,
    fulfillment_type: fulfillmentTypeByOrderType[input.draft.orderType],
    cabin_label: input.draft.orderType === 'dine_in' ? input.draft.boothName : '',
    delivery_address: input.draft.orderType === 'delivery' ? input.draft.deliveryAddress : '',
    delivery_city: deliveryCity,
    delivery_settlement: deliverySettlement,
    client_address_comment: addressComment,
    comment: input.draft.deliveryComment,
    items
  });

  if (error) throw error;
  const orderId = String(data);
  const deliveryProvider = deliveryProviderForOrder(input.draft.orderType, input.restaurant.deliveryProvider);
  const paymentStatus = initialPaymentStatus(input.draft.orderType, input.draft.paymentMethod);
  const status = initialOrderStatus(input.draft.orderType, input.draft.paymentMethod);

  const updateResult = await supabase
    .from('orders')
    .update({
      order_type: input.draft.orderType,
      status,
      payment_status: paymentStatus,
      delivery_provider: deliveryProvider,
      client_name: clientName,
      client_phone: clientPhone,
      delivery_address: input.draft.orderType === 'delivery' ? input.draft.deliveryAddress : null,
      delivery_lat: input.draft.orderType === 'delivery' ? input.draft.deliveryLat : null,
      delivery_lng: input.draft.orderType === 'delivery' ? input.draft.deliveryLng : null,
      client_accuracy_m: input.draft.orderType === 'delivery' ? input.draft.deliveryAccuracyM : null,
      delivery_address_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryAddress : null,
      delivery_entrance_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryEntrance : null,
      delivery_floor_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryFloor : null,
      delivery_apartment_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryApartment : null,
      delivery_intercom_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryIntercomCode : null,
      delivery_landmark_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryLandmark : null,
      delivery_comment_snapshot: input.draft.orderType === 'delivery' ? input.draft.deliveryComment : null,
      client_lat: input.draft.orderType === 'delivery' ? input.draft.deliveryLat : null,
      client_lng: input.draft.orderType === 'delivery' ? input.draft.deliveryLng : null,
      restaurant_address_snapshot: input.restaurant.addressLine || input.restaurant.description,
      restaurant_lat_snapshot: input.restaurant.lat,
      restaurant_lng_snapshot: input.restaurant.lng,
      delivery_comment: input.draft.orderType === 'delivery' ? input.draft.deliveryComment : null,
      booth_name: input.draft.orderType === 'dine_in' ? input.draft.boothName : null,
      delivery_fee: input.deliveryFee,
      subtotal_amount: input.subtotal,
      total_amount: input.total,
      total: input.total
    })
    .eq('id', orderId);

  if (updateResult.error) throw updateResult.error;
  return orderId;
}

export type ClientOrderRealtimePatch = {
  readonly id: string;
  readonly status?: string;
  readonly paymentStatus?: ClientPaymentStatus;
  readonly driverName?: string;
  readonly driverPhone?: string;
};

export function subscribeClientOrderRealtime(orderId: string, onChange: (patch: ClientOrderRealtimePatch) => void) {
  const client = supabase;
  if (!client) return () => undefined;

  const fetchOrder = async () => {
    const { data, error } = await client
      .from('orders')
      .select('id, status, payment_status, deliveries(driver_id, drivers(name, phone))')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !data) return;
    const delivery = Array.isArray(data.deliveries) ? data.deliveries[0] : data.deliveries;
    const driver = Array.isArray(delivery?.drivers) ? delivery?.drivers[0] : delivery?.drivers;
    onChange({
      id: String(data.id),
      status: String(data.status),
      paymentStatus: data.payment_status as ClientPaymentStatus,
      driverName: driver?.name ? String(driver.name) : undefined,
      driverPhone: driver?.phone ? String(driver.phone) : undefined
    });
  };

  void fetchOrder();

  const channel = client
    .channel(`client-order-${orderId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, fetchOrder)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `order_id=eq.${orderId}` }, fetchOrder)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function getClientPlatformSnapshot(): Promise<ClientPlatformSnapshot> {
  if (!supabase) return clientPlatformSnapshot;

  const catalogsResult = await supabase
    .from('catalogs')
    .select('id, slug, name, description, logo_url, banner_url, status')
    .eq('status', 'published')
    .order('name');

  if (catalogsResult.error || !catalogsResult.data?.length) return clientPlatformSnapshot;

  const catalogs = catalogsResult.data as CatalogRow[];
  const catalogIds = catalogs.map((catalog) => catalog.id);

  const [
    categoriesResult,
    productsResult,
    productImagesResult,
    themeResult,
    deliveryResult,
    paymentsResult,
    restaurantProfilesResult,
    bannersResult,
    settingsResult
  ] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id, catalog_id, slug, name, image_url, is_hidden, sort_order')
        .in('catalog_id', catalogIds)
        .order('sort_order'),
      supabase
        .from('products')
        .select('id, catalog_id, category_id, title, status, price, description, weight, stock_count, is_popular')
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
        .from('platform_banners')
        .select('id, title, subtitle, kind, image_url, link_url, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('platform_settings').select('support_whatsapp').eq('id', 'global').maybeSingle()
    ]);

  let categories = (categoriesResult.data ?? []) as CategoryRow[];
  let products = (productsResult.data ?? []) as ProductRow[];
  const productImages = (productImagesResult.data ?? []) as ProductImageRow[];
  const themes = (themeResult.data ?? []) as ThemeRow[];
  const deliverySettings = (deliveryResult.data ?? []) as DeliverySettingsRow[];
  const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
  const restaurantProfiles = (restaurantProfilesResult.data ?? []) as RestaurantProfileRow[];
  const bannerRows = (bannersResult.data ?? []) as PlatformBannerRow[];
  const settingsRow = settingsResult.data as PlatformSettingsRow | null;

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

  const categoriesByCatalog = new Map<string, CategoryRow[]>();
  categories
    .filter((category) => !category.is_hidden)
    .forEach((category) => {
      categoriesByCatalog.set(category.catalog_id, [...(categoriesByCatalog.get(category.catalog_id) ?? []), category]);
    });

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const firstImageByProductId = new Map<string, string>();
  productImages.forEach((image) => {
    if (!firstImageByProductId.has(image.product_id)) {
      firstImageByProductId.set(image.product_id, image.url);
    }
  });

  const themeByCatalog = new Map(themes.map((theme) => [theme.catalog_id, theme.settings]));
  const deliveryByCatalog = new Map(deliverySettings.map((settings) => [settings.catalog_id, settings]));
  const paymentByCatalog = new Map(paymentRows.map((payment) => [payment.restaurant_id, payment]));
  const restaurantProfileByCatalog = new Map(
    restaurantProfiles
      .filter((profile): profile is RestaurantProfileRow & { catalog_id: string } => Boolean(profile.catalog_id))
      .map((profile) => [profile.catalog_id, profile])
  );

  const platformCategories: ClientPlatformCategory[] = unique(
    categories.filter((category) => !category.is_hidden).map((category) => category.slug)
  ).map((slug) => {
    const category = categories.find((item) => item.slug === slug);
    return {
      id: `platform-${slug}`,
      slug,
      name: category?.name ?? slug,
      imageUrl: category?.image_url || firstImageByProductId.get(products.find((product) => categoryById.get(product.category_id ?? '')?.slug === slug)?.id ?? '') || '',
      isActive: true
    };
  });

  const cityNames = unique(
    deliverySettings.flatMap((settings) => [
      settings.primary_city || fallbackCityName,
      ...(settings.service_settlements ?? [])
    ])
  );
  const cities: ClientCity[] = (cityNames.length > 0 ? cityNames : [fallbackCityName]).map((name) => ({
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
      coverUrl: catalog.banner_url || catalogCategories.find((category) => category.image_url)?.image_url || '',
      rating: 4.7,
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
      publicPath: `/${catalog.slug}`
    };
  });

  const restaurantCategories: ClientRestaurantCategory[] = categories
    .filter((category) => !category.is_hidden)
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
      imageUrl: firstImageByProductId.get(product.id) ?? '',
      tags: product.status === 'sold_out' ? ['Нет в наличии'] : product.is_popular ? ['Популярное'] : [],
      isPopular: product.is_popular,
      stockCount: product.stock_count,
      weight: product.weight
    }];
  });

  return {
    cities,
    categories: platformCategories.length > 0 ? platformCategories : clientPlatformSnapshot.categories,
    restaurants,
    restaurantCategories,
    dishes,
    paymentSettings: restaurants.map((restaurant) =>
      mapPaymentSettings(paymentByCatalog.get(restaurant.id), restaurant.slug)
    ),
    banners: bannerRows.length > 0
      ? bannerRows.map((banner) => ({
          id: banner.id,
          title: banner.title,
          subtitle: banner.subtitle,
          kind: banner.kind,
          imageUrl: banner.image_url,
          linkUrl: banner.link_url,
          isActive: banner.is_active
        }))
      : clientPlatformSnapshot.banners,
    supportWhatsapp: settingsRow?.support_whatsapp || clientPlatformSnapshot.supportWhatsapp
  };
}
