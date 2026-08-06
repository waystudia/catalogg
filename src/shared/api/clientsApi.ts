import { supabase } from '../supabase';
import type {
  ClientListParams,
  ClientSignup,
  CreateClientPayload,
  CreateClientResult,
  PlatformBannerAdmin,
  PlatformContestTicket,
  PlatformGlobalSettings,
  PlatformAnalytics,
  PlatformClient,
  PlatformStats,
  PlatformUserDirectory,
  PlatformUserDirectoryItem,
  PlatformUserOrder,
  UpdateClientPayload,
  UpdateClientResult
} from './platformTypes';
import { summarizePlatformStats, type PlatformOrderStatsRow } from './platformStats';
import { normalizeBusinessType } from '../businessTerminology';

const demoClients: PlatformClient[] = [
  {
    id: 'demo-mangal',
    companyName: 'Мангал',
    ownerName: 'Мухаммад Алиев',
    email: 'mangal.restourant@outlook.com',
    phone: '+7 922 892-89-28',
    primaryCity: 'Грозный',
    serviceSettlements: ['Черноречье', 'Беркат-Юрт'],
    status: 'active',
    planCode: 'business',
    subscriptionStatus: 'active',
    subscriptionEndsAt: null,
    catalogId: 'catalog-mangal',
    catalogName: 'Мангал',
    catalogSlug: 'mangal',
    catalogStatus: 'published',
    templateName: 'Restaurant Modern',
    templateKey: 'restaurant-modern',
    templateVersion: 1,
    businessType: 'restaurant',
    logoUrl: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-rizih',
    companyName: 'Rizih',
    ownerName: '',
    email: 'admin@rizih.example',
    phone: '',
    primaryCity: 'Грозный',
    serviceSettlements: [],
    status: 'active',
    planCode: 'trial',
    subscriptionStatus: 'trial',
    subscriptionEndsAt: null,
    catalogId: 'catalog-rizih',
    catalogName: 'Rizih',
    catalogSlug: 'rizih',
    catalogStatus: 'published',
    templateName: 'Restaurant Modern',
    templateKey: 'restaurant-modern',
    templateVersion: 2,
    businessType: 'restaurant',
    logoUrl: '',
    createdAt: new Date().toISOString()
  }
];

const demoClientSignups: ClientSignup[] = [
  {
    id: 'signup-adam',
    name: 'Адам М.',
    phone: '+7 928 123-45-67',
    source: 'client_profile',
    createdAt: new Date().toISOString()
  },
  {
    id: 'signup-madina',
    name: 'Мадина',
    phone: '+7 928 555-44-33',
    source: 'delivery_checkout',
    createdAt: new Date(Date.now() - 86_400_000).toISOString()
  }
];

type ClientRow = {
  id: string;
  company_name: string;
  owner_name: string | null;
  email: string;
  phone: string | null;
  primary_city: string | null;
  service_settlements: string[] | null;
  status: PlatformClient['status'];
  plan_code: string | null;
  subscription_status: PlatformClient['subscriptionStatus'];
  subscription_ends_at: string | null;
  created_at: string;
  business_type: string | null;
  is_test?: boolean | null;
  catalogs?: {
    id?: string;
    name?: string;
    slug?: string;
    status?: PlatformClient['catalogStatus'];
    logo_url?: string;
    template_versions?: {
      version?: number;
      templates?: {
        key?: string;
        name?: string;
        business_type?: string;
      } | null;
    } | null;
  } | null;
};

type ClientSignupRow = {
  id: string;
  name: string;
  phone: string;
  source: string;
  created_at: string;
};

type ProfileSignupRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

type PlatformBannerRow = {
  id: string;
  name?: string | null;
  title: string;
  subtitle: string;
  kind: PlatformBannerAdmin['kind'];
  image_url: string;
  background_color: string;
  link_url: string;
  page_id?: string | null;
  platform_content_pages?: { slug?: string | null } | Array<{ slug?: string | null }> | null;
  action_label: string;
  content_position?: PlatformBannerAdmin['contentPosition'] | null;
  button_position?: PlatformBannerAdmin['buttonPosition'] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  sort_order: number;
  is_active: boolean;
};

type ContestOrderRow = {
  id: string;
  client_name?: string | null;
  client_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_city?: string | null;
  delivery_settlement?: string | null;
  total?: number | string | null;
  total_amount?: number | string | null;
  created_at: string;
  restaurants?: { name?: string | null } | Array<{ name?: string | null }> | null;
  order_items?: Array<{
    quantity?: number | null;
    dish_name_snapshot?: string | null;
    title?: string | null;
  }> | null;
};

const hiddenContestTicketStorageKey = 'waycatalog-hidden-contest-tickets';

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const readHiddenContestTickets = () => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const value = window.localStorage.getItem(hiddenContestTicketStorageKey);
    return new Set<string>(value ? JSON.parse(value) as string[] : []);
  } catch {
    return new Set<string>();
  }
};

const writeHiddenContestTickets = (ids: Set<string>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(hiddenContestTicketStorageKey, JSON.stringify(Array.from(ids)));
};

const mapClient = (row: ClientRow): PlatformClient => ({
  id: row.id,
  companyName: row.company_name,
  ownerName: row.owner_name ?? '',
  email: row.email,
  phone: row.phone ?? '',
  primaryCity: row.primary_city ?? '',
  serviceSettlements: Array.isArray(row.service_settlements) ? row.service_settlements.filter(Boolean) : [],
  status: row.status,
  planCode: row.plan_code ?? 'trial',
  subscriptionStatus: row.subscription_status,
  subscriptionEndsAt: row.subscription_ends_at,
  catalogId: row.catalogs?.id ?? '',
  catalogName: row.catalogs?.name ?? row.company_name,
  catalogSlug: row.catalogs?.slug ?? '',
  catalogStatus: row.catalogs?.status ?? 'draft',
  templateName: row.catalogs?.template_versions?.templates?.name ?? 'Template',
  templateKey: row.catalogs?.template_versions?.templates?.key ?? 'restaurant-modern',
  templateVersion: row.catalogs?.template_versions?.version ?? 1,
  businessType: normalizeBusinessType(row.business_type),
  logoUrl: row.catalogs?.logo_url ?? '',
  createdAt: row.created_at,
  isTest: row.is_test === true
});

const mapClientSignup = (row: ClientSignupRow): ClientSignup => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  source: row.source,
  createdAt: row.created_at
});

const mapProfileSignup = (row: ProfileSignupRow): ClientSignup => ({
  id: `profile-${row.id}`,
  name: row.full_name || row.email || 'Пользователь',
  phone: '',
  email: row.email ?? '',
  source: 'auth_user',
  createdAt: row.created_at
});

const mapPlatformBanner = (row: PlatformBannerRow): PlatformBannerAdmin => ({
  id: row.id,
  name: row.name?.trim() || row.title,
  title: row.title,
  subtitle: row.subtitle,
  kind: row.kind,
  imageUrl: row.image_url,
  backgroundColor: row.background_color || '#5b3df4',
  linkUrl: firstRelation(row.platform_content_pages)?.slug
    ? `/pages/${firstRelation(row.platform_content_pages)?.slug}`
    : row.link_url,
  pageId: row.page_id ?? null,
  actionLabel: row.action_label || 'Заказать',
  contentPosition: row.content_position ?? 'top-left',
  buttonPosition: row.button_position ?? 'bottom-left',
  startsAt: row.starts_at ?? null,
  endsAt: row.ends_at ?? null,
  sortOrder: row.sort_order,
  isActive: row.is_active
});

const filterDemoClients = (params: ClientListParams) => {
  const search = params.search?.trim().toLowerCase();
  const filtered = demoClients.filter((client) => {
    const matchesSearch =
      !search ||
      [client.companyName, client.email, client.phone, client.catalogSlug, client.catalogName]
        .join(' ')
        .toLowerCase()
        .includes(search);
    const matchesStatus = !params.status || params.status === 'all' || client.status === params.status;
    const matchesPayment =
      !params.payment || params.payment === 'all' || client.subscriptionStatus === params.payment;
    const matchesTemplate =
      !params.templateId || params.templateId === 'all' || client.templateKey === params.templateId;
    return matchesSearch && matchesStatus && matchesPayment && matchesTemplate;
  });
  const from = (params.page - 1) * params.pageSize;
  return { data: filtered.slice(from, from + params.pageSize), count: filtered.length };
};

async function getFunctionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: string };
        if (body.error) return body.error;
      } catch {
        // Fall through to the original error message.
      }
    }
  }

  return error instanceof Error ? error.message : 'Не удалось выполнить Edge Function.';
}

export async function getClients(params: ClientListParams): Promise<{ data: PlatformClient[]; count: number }> {
  if (!supabase) return filterDemoClients(params);

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  let query = supabase
    .from('clients')
    .select(
      'id, company_name, owner_name, email, phone, primary_city, service_settlements, status, plan_code, subscription_status, subscription_ends_at, business_type, is_test, created_at, catalogs(id, name, slug, status, logo_url, template_versions(version, templates(key, name, business_type)))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.search?.trim()) {
    const search = `%${params.search.trim()}%`;
    query = query.or(`company_name.ilike.${search},email.ilike.${search},phone.ilike.${search}`);
  }
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  if (params.payment && params.payment !== 'all') {
    query = query.eq('subscription_status', params.payment);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { data: ((data ?? []) as ClientRow[]).map(mapClient), count: count ?? 0 };
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const clients = await getClients({ page: 1, pageSize: 1000, status: 'all', payment: 'all', templateId: 'all' });
  if (!supabase) {
    return summarizePlatformStats(clients.data, []);
  }

  const [ordersResult, catalogsResult] = await Promise.all([
    supabase
      .from('orders')
      .select('catalog_id, restaurant_id, total, total_amount, delivery_provider, status, is_test_order')
      .eq('is_test_order', false)
      .limit(1000),
    supabase
      .from('catalogs')
      .select('id, name, slug, status, logo_url, business_type, is_template, created_at')
      .order('created_at', { ascending: false })
  ]);
  const fallbackOrdersResult = ordersResult.error
    ? await supabase.from('orders').select('catalog_id, total, status, is_test_order').eq('is_test_order', false).limit(1000)
    : null;
  const orderRows = ((ordersResult.data ?? fallbackOrdersResult?.data ?? []) as PlatformOrderStatsRow[]);
  const knownCatalogIds = new Set(clients.data.map((client) => client.catalogId).filter(Boolean));
  const orphanCatalogs: PlatformClient[] = ((catalogsResult.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    status: PlatformClient['catalogStatus'];
    logo_url: string | null;
    business_type: string | null;
    is_template: boolean | null;
    created_at: string;
  }>)
    .filter((catalog) => catalog.is_template !== true && !knownCatalogIds.has(catalog.id))
    .map((catalog) => ({
      id: '',
      companyName: catalog.name,
      ownerName: '',
      email: '',
      phone: '',
      primaryCity: '',
      serviceSettlements: [],
      status: 'pending',
      planCode: 'unlinked',
      subscriptionStatus: 'trial',
      subscriptionEndsAt: null,
      catalogId: catalog.id,
      catalogName: catalog.name,
      catalogSlug: catalog.slug,
      catalogStatus: catalog.status,
      templateName: 'Не привязан к клиенту',
      templateKey: 'unlinked',
      templateVersion: 1,
      businessType: normalizeBusinessType(catalog.business_type),
      logoUrl: catalog.logo_url ?? '',
      createdAt: catalog.created_at
    }));

  return summarizePlatformStats([...clients.data, ...orphanCatalogs], orderRows);
}

type PlatformAnalyticsOrderRow = {
  client_name?: string | null;
  client_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  fulfillment_type?: string | null;
  order_type?: string | null;
  delivery_city?: string | null;
  delivery_settlement?: string | null;
};

const normalizeCustomerKey = (order: PlatformAnalyticsOrderRow) => {
  const phone = (order.client_phone || order.customer_phone || '').replace(/\D/g, '');
  if (phone) return `phone:${phone}`;
  const name = (order.client_name || order.customer_name || '').trim().toLocaleLowerCase('ru-RU');
  return name ? `name:${name}` : '';
};

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  if (!supabase) {
    return {
      totalOrders: 0,
      uniqueCustomers: 0,
      repeatCustomers: 0,
      repeatOrderRate: 0,
      orderTypes: [
        { key: 'hall', label: 'В зале', count: 0 },
        { key: 'takeaway', label: 'На вынос', count: 0 },
        { key: 'delivery', label: 'Доставка', count: 0 }
      ],
      locations: []
    };
  }

  const { data, error } = await supabase
    .from('orders')
    .select('client_name, client_phone, customer_name, customer_phone, fulfillment_type, order_type, delivery_city, delivery_settlement')
    .eq('is_test_order', false)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const rows = (data ?? []) as PlatformAnalyticsOrderRow[];
  const customerOrders = new Map<string, number>();
  const locations = new Map<string, number>();
  const orderTypeCounts = { hall: 0, takeaway: 0, delivery: 0 };

  rows.forEach((order) => {
    const customerKey = normalizeCustomerKey(order);
    if (customerKey) customerOrders.set(customerKey, (customerOrders.get(customerKey) ?? 0) + 1);

    const rawType = order.fulfillment_type || order.order_type || 'hall';
    const orderType = rawType === 'delivery' ? 'delivery' : rawType === 'takeaway' || rawType === 'pickup' ? 'takeaway' : 'hall';
    orderTypeCounts[orderType] += 1;

    const location = (order.delivery_settlement || order.delivery_city || '').trim();
    if (location) locations.set(location, (locations.get(location) ?? 0) + 1);
  });

  const repeatCustomers = Array.from(customerOrders.values()).filter((count) => count > 1).length;
  return {
    totalOrders: rows.length,
    uniqueCustomers: customerOrders.size,
    repeatCustomers,
    repeatOrderRate: customerOrders.size > 0 ? Math.round((repeatCustomers / customerOrders.size) * 100) : 0,
    orderTypes: [
      { key: 'hall', label: 'В зале', count: orderTypeCounts.hall },
      { key: 'takeaway', label: 'На вынос', count: orderTypeCounts.takeaway },
      { key: 'delivery', label: 'Доставка', count: orderTypeCounts.delivery }
    ],
    locations: Array.from(locations, ([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8)
  };
}

export async function getClientSignups(): Promise<ClientSignup[]> {
  if (!supabase) return demoClientSignups;

  const signupsResult = await supabase
    .from('client_signups')
    .select('id, name, phone, source, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (signupsResult.error) throw signupsResult.error;

  const [profilesResult, clientOwnersResult, roleUsersResult, platformAdminsResult] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, created_at').eq('is_test', false).order('created_at', { ascending: false }).limit(100),
    supabase.from('clients').select('owner_user_id'),
    supabase.from('users').select('auth_user_id, role').not('auth_user_id', 'is', null),
    supabase.from('platform_admins').select('user_id')
  ]);
  const signups = ((signupsResult.data ?? []) as ClientSignupRow[]).map(mapClientSignup);
  const excludedProfileIds = new Set<string>([
    ...((clientOwnersResult.data ?? []) as Array<{ owner_user_id: string | null }>).map((row) => row.owner_user_id).filter((id): id is string => Boolean(id)),
    ...((roleUsersResult.data ?? []) as Array<{ auth_user_id: string | null; role: string | null }>)
      .filter((row) => row.role !== 'client')
      .map((row) => row.auth_user_id)
      .filter((id): id is string => Boolean(id)),
    ...((platformAdminsResult.data ?? []) as Array<{ user_id: string | null }>).map((row) => row.user_id).filter((id): id is string => Boolean(id))
  ]);
  const profileSignups = profilesResult.error ? [] : ((profilesResult.data ?? []) as ProfileSignupRow[])
    .filter((profile) => !excludedProfileIds.has(profile.id))
    .map(mapProfileSignup);
  const seen = new Set(signups.map((signup) => signup.phone || signup.name));

  return [
    ...signups,
    ...profileSignups.filter((signup) => {
      const key = signup.phone || signup.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  ];
}

type PlatformUserOrderRow = {
  id: string;
  catalog_id?: string | null;
  restaurant_id?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_city?: string | null;
  delivery_settlement?: string | null;
  total?: number | string | null;
  total_amount?: number | string | null;
  status?: string | null;
  created_at: string;
  restaurants?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

const normalizeDirectoryPhone = (value: string) => value.replace(/\D/g, '');
const normalizeDirectoryName = (value: string) => value.trim().toLocaleLowerCase('ru-RU');
const makeDirectoryKey = (phone: string, email: string, name: string) => {
  const normalizedPhone = normalizeDirectoryPhone(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  const normalizedEmail = email.trim().toLocaleLowerCase('ru-RU');
  if (normalizedEmail) return `email:${normalizedEmail}`;
  const normalizedName = normalizeDirectoryName(name);
  return normalizedName ? `name:${normalizedName}` : '';
};

const isCanceledDirectoryOrder = (status: string) => status === 'cancelled' || status === 'canceled';

export async function getPlatformUserDirectory(): Promise<PlatformUserDirectory> {
  const signups = await getClientSignups();
  if (!supabase) {
    return {
      users: signups.map((signup) => ({
        id: signup.id,
        name: signup.name || 'Пользователь',
        phone: signup.phone,
        email: signup.email ?? '',
        cityName: signup.cityName ?? '',
        source: signup.source,
        createdAt: signup.createdAt,
        ordersCount: 0,
        totalSpent: 0,
        averageCheck: 0,
        lastOrderAt: null,
        favoriteRestaurant: '',
        orders: []
      })),
      totalOrders: 0,
      totalRevenue: 0,
      settlements: [],
      restaurants: []
    };
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id, catalog_id, restaurant_id, client_name, client_phone, customer_name, customer_phone, delivery_city, delivery_settlement, total, total_amount, status, created_at, restaurants(name)')
    .eq('is_test_order', false)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const usersByKey = new Map<string, PlatformUserDirectoryItem>();
  const restaurantNamesById = new Map<string, string>();

  signups.forEach((signup) => {
    const key = makeDirectoryKey(signup.phone, signup.email ?? '', signup.name);
    if (!key || usersByKey.has(key)) return;
    usersByKey.set(key, {
      id: signup.id,
      name: signup.name || 'Пользователь',
      phone: signup.phone,
      email: signup.email ?? '',
      cityName: signup.cityName ?? '',
      source: signup.source,
      createdAt: signup.createdAt,
      ordersCount: 0,
      totalSpent: 0,
      averageCheck: 0,
      lastOrderAt: null,
      favoriteRestaurant: '',
      orders: []
    });
  });

  ((data ?? []) as unknown as PlatformUserOrderRow[]).forEach((row) => {
    const name = row.client_name || row.customer_name || 'Пользователь';
    const phone = row.client_phone || row.customer_phone || '';
    const key = makeDirectoryKey(phone, '', name);
    if (!key) return;
    const restaurant = firstRelation(row.restaurants)?.name ?? 'Ресторан';
    const restaurantId = row.restaurant_id ?? row.catalog_id ?? restaurant;
    const cityName = row.delivery_settlement || row.delivery_city || '';
    const amount = Math.max(0, Number(row.total_amount ?? 0) || Number(row.total ?? 0) || 0);
    const status = row.status ?? '';
    const current = usersByKey.get(key) ?? {
      id: `order-user-${key}`,
      name,
      phone,
      email: '',
      cityName,
      source: 'order',
      createdAt: row.created_at,
      ordersCount: 0,
      totalSpent: 0,
      averageCheck: 0,
      lastOrderAt: null,
      favoriteRestaurant: '',
      orders: []
    };
    const order: PlatformUserOrder = {
      id: row.id,
      restaurantId,
      restaurantName: restaurant,
      amount,
      status,
      cityName,
      createdAt: row.created_at
    };
    current.orders.push(order);
    current.ordersCount += 1;
    if (!isCanceledDirectoryOrder(status)) current.totalSpent += amount;
    if (!current.cityName && cityName) current.cityName = cityName;
    if (!current.lastOrderAt || Date.parse(row.created_at) > Date.parse(current.lastOrderAt)) {
      current.lastOrderAt = row.created_at;
    }
    usersByKey.set(key, current);
    restaurantNamesById.set(restaurantId, restaurant);
  });

  const users = Array.from(usersByKey.values()).map((user) => {
    const restaurantCounts = new Map<string, number>();
    user.orders.forEach((order) => {
      restaurantCounts.set(order.restaurantName, (restaurantCounts.get(order.restaurantName) ?? 0) + 1);
    });
    const favoriteRestaurant = Array.from(restaurantCounts.entries())
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? '';
    return {
      ...user,
      averageCheck: user.ordersCount > 0 ? Math.round(user.totalSpent / user.ordersCount) : 0,
      favoriteRestaurant,
      orders: user.orders.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    };
  }).sort((left, right) => {
    const leftDate = left.lastOrderAt ?? left.createdAt;
    const rightDate = right.lastOrderAt ?? right.createdAt;
    return Date.parse(rightDate) - Date.parse(leftDate);
  });

  return {
    users,
    totalOrders: users.reduce((sum, user) => sum + user.ordersCount, 0),
    totalRevenue: users.reduce((sum, user) => sum + user.totalSpent, 0),
    settlements: Array.from(new Set(users.map((user) => user.cityName).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ru')),
    restaurants: Array.from(restaurantNamesById, ([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  };
}

export async function createClientSignup(input: { name: string; phone: string }): Promise<ClientSignup> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name || !phone) throw new Error('Укажите имя и телефон пользователя.');
  if (!supabase) {
    return {
      id: `local-signup-${Date.now().toString(36)}`,
      name,
      phone,
      source: 'platform_admin',
      createdAt: new Date().toISOString()
    };
  }

  const { data, error } = await supabase
    .from('client_signups')
    .insert({ name, phone, source: 'platform_admin' })
    .select('id, name, phone, source, created_at')
    .single();
  if (error) throw error;
  return mapClientSignup(data as ClientSignupRow);
}

export async function deleteClientSignup(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('client_signups').delete().eq('id', id);
  if (error) throw error;
}

export async function getPlatformGlobalSettings(): Promise<PlatformGlobalSettings> {
  const defaults: PlatformGlobalSettings = {
    supportWhatsapp: '79990000000',
    supportPhone: '',
    supportEmail: '',
    supportTelegram: '',
    supportHours: '',
    supportHint: ''
  };
  if (!supabase) return defaults;

  const modernResult = await supabase
    .from('platform_settings')
    .select('support_whatsapp, support_phone, support_email, support_telegram, support_hours, support_hint')
    .eq('id', 'global')
    .maybeSingle();
  const legacyResult = modernResult.error
    ? await supabase.from('platform_settings').select('support_whatsapp').eq('id', 'global').maybeSingle()
    : null;
  if (modernResult.error && legacyResult?.error) throw legacyResult.error;
  const data = (modernResult.data ?? legacyResult?.data) as {
    support_whatsapp?: string;
    support_phone?: string;
    support_email?: string;
    support_telegram?: string;
    support_hours?: string;
    support_hint?: string;
  } | null;
  return {
    supportWhatsapp: data?.support_whatsapp ?? '',
    supportPhone: data?.support_phone ?? '',
    supportEmail: data?.support_email ?? '',
    supportTelegram: data?.support_telegram ?? '',
    supportHours: data?.support_hours ?? '',
    supportHint: data?.support_hint ?? ''
  };
}

export async function savePlatformGlobalSettings(settings: PlatformGlobalSettings) {
  if (!supabase) return;
  const payload = {
    id: 'global',
    support_whatsapp: settings.supportWhatsapp,
    support_phone: settings.supportPhone,
    support_email: settings.supportEmail,
    support_telegram: settings.supportTelegram,
    support_hours: settings.supportHours,
    support_hint: settings.supportHint,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('platform_settings').upsert(payload);
  if (!error) return;
  const { error: legacyError } = await supabase.from('platform_settings').upsert({
    id: 'global',
    support_whatsapp: settings.supportWhatsapp,
    updated_at: new Date().toISOString()
  });
  if (legacyError) throw legacyError;
}

export async function getPlatformBanners(): Promise<PlatformBannerAdmin[]> {
  if (!supabase) {
    return [{
      id: 'demo-banner',
      name: 'Конкурс от WayYaam',
      title: 'Конкурс от WayYaam',
      subtitle: 'Закажи на 1000₽ и выиграй приз',
      kind: 'contest',
      imageUrl: '',
      backgroundColor: '#5b3df4',
      linkUrl: '/restaurants',
      pageId: null,
      actionLabel: 'Подробнее',
      contentPosition: 'top-left',
      buttonPosition: 'bottom-left',
      startsAt: null,
      endsAt: null,
      sortOrder: 0,
      isActive: true
    }];
  }

  const modernResult = await supabase
    .from('platform_banners')
    .select('id, name, title, subtitle, kind, image_url, background_color, link_url, page_id, action_label, content_position, button_position, starts_at, ends_at, sort_order, is_active, platform_content_pages(slug)')
    .order('sort_order');
  const legacyResult = modernResult.error
    ? await supabase
      .from('platform_banners')
      .select('id, title, subtitle, kind, image_url, background_color, link_url, action_label, sort_order, is_active')
      .order('sort_order')
    : null;
  if (modernResult.error && legacyResult?.error) throw legacyResult.error;
  return ((modernResult.data ?? legacyResult?.data ?? []) as PlatformBannerRow[]).map(mapPlatformBanner);
}

export async function savePlatformBanner(banner: Omit<PlatformBannerAdmin, 'id'> & { id?: string }) {
  if (!supabase) return;
  const payload = {
    name: banner.name,
    title: banner.title,
    subtitle: banner.subtitle,
    kind: banner.kind,
    image_url: banner.imageUrl,
    background_color: banner.backgroundColor,
    link_url: banner.linkUrl,
    page_id: banner.pageId,
    action_label: banner.actionLabel,
    content_position: banner.contentPosition,
    button_position: banner.buttonPosition,
    starts_at: banner.startsAt,
    ends_at: banner.endsAt,
    sort_order: banner.sortOrder,
    is_active: banner.isActive
  };
  const modernQuery = banner.id
    ? supabase.from('platform_banners').update(payload).eq('id', banner.id)
    : supabase.from('platform_banners').insert(payload);
  const { error } = await modernQuery;
  if (!error) return;

  const legacyPayload = {
    title: banner.title,
    subtitle: banner.subtitle,
    kind: banner.kind === 'banner' ? 'promo' : banner.kind,
    image_url: banner.imageUrl,
    background_color: banner.backgroundColor,
    link_url: banner.linkUrl,
    action_label: banner.actionLabel,
    sort_order: banner.sortOrder,
    is_active: banner.isActive
  };
  const legacyQuery = banner.id
    ? supabase.from('platform_banners').update(legacyPayload).eq('id', banner.id)
    : supabase.from('platform_banners').insert(legacyPayload);
  const { error: legacyError } = await legacyQuery;
  if (legacyError) throw legacyError;
}

export async function uploadPlatformBannerMedia(file: File): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase не настроен');
  }
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error('Выберите изображение или видео');
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error('Размер файла не должен превышать 30 МБ');
  }

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (
    file.type.startsWith('video/') ? 'mp4' : 'jpg'
  );
  const fileName = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const bucket = supabase.storage.from('platform-banner-media');
  const { error } = await bucket.upload(fileName, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return bucket.getPublicUrl(fileName).data.publicUrl;
}

export async function deletePlatformBanner(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('platform_banners').delete().eq('id', id);
  if (error) throw error;
}

export async function getPlatformContestTickets(contestId = 'all'): Promise<PlatformContestTicket[]> {
  const hiddenIds = readHiddenContestTickets();
  if (!supabase) {
    return [{
      id: 'demo-ticket',
      contestId,
      orderId: 'demo-order',
      restaurantName: 'Мангал',
      customerName: 'Адам М.',
      customerPhone: '+7 928 555-12-12',
      deliveryCity: 'Цоци-Юрт',
      totalAmount: 1470,
      orderedItems: ['Шашлык из баранины x 1', 'Чеченский чай x 1'],
      createdAt: new Date().toISOString()
    }].filter((ticket) => !hiddenIds.has(ticket.id));
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id, client_name, client_phone, customer_name, customer_phone, delivery_city, delivery_settlement, total, total_amount, created_at, restaurants(name), order_items(quantity, dish_name_snapshot, title)')
    .eq('is_test_order', false)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return [];

  return ((data ?? []) as unknown as ContestOrderRow[])
    .map((order) => {
      const ticket: PlatformContestTicket = {
        id: `${contestId}-${order.id}`,
        contestId,
        orderId: order.id,
        restaurantName: firstRelation(order.restaurants)?.name ?? 'Ресторан',
        customerName: order.client_name || order.customer_name || 'Клиент',
        customerPhone: order.client_phone || order.customer_phone || '',
        deliveryCity: order.delivery_settlement || order.delivery_city || '',
        totalAmount: Number(order.total_amount ?? 0) > 0
          ? Number(order.total_amount)
          : Number(order.total ?? 0),
        orderedItems: (order.order_items ?? []).map((item) => {
          const quantity = Math.max(1, Number(item.quantity ?? 1));
          return `${item.dish_name_snapshot || item.title || 'Блюдо'} x ${quantity}`;
        }),
        createdAt: order.created_at
      };
      return ticket;
    })
    .filter((ticket) => !hiddenIds.has(ticket.id));
}

export async function deletePlatformContestTicket(id: string) {
  const hiddenIds = readHiddenContestTickets();
  hiddenIds.add(id);
  writeHiddenContestTickets(hiddenIds);
}

export async function createClient(payload: CreateClientPayload): Promise<CreateClientResult> {
  if (!supabase) {
    return {
      clientId: crypto.randomUUID(),
      catalogId: crypto.randomUUID(),
      slug: payload.slug,
      email: payload.email
    };
  }

  const { data, error } = await supabase.functions.invoke<CreateClientResult>('create-client', {
    body: payload
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data) throw new Error('Edge Function did not return client data.');
  return data;
}

export async function updateClient(payload: UpdateClientPayload): Promise<UpdateClientResult> {
  if (!supabase) {
    return {
      clientId: payload.clientId,
      email: payload.email ?? 'demo@example.com'
    };
  }

  const { data, error } = await supabase.functions.invoke<UpdateClientResult>('update-client', {
    body: payload
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data) throw new Error('Edge Function did not return updated client data.');
  return data;
}
