import { supabase } from '../supabase';
import type {
  ClientListParams,
  ClientSignup,
  CreateClientPayload,
  CreateClientResult,
  PlatformBannerAdmin,
  PlatformContestTicket,
  PlatformGlobalSettings,
  PlatformClient,
  PlatformStats,
  UpdateClientPayload,
  UpdateClientResult
} from './platformTypes';
import { summarizePlatformStats, type PlatformOrderStatsRow } from './platformStats';

const demoClients: PlatformClient[] = [
  {
    id: 'demo-grill',
    companyName: 'Grill House',
    ownerName: 'Алексей',
    email: 'grill@house.com',
    phone: '+7 999 123-45-67',
    primaryCity: 'Грозный',
    serviceSettlements: ['Черноречье', 'Беркат-Юрт'],
    status: 'active',
    planCode: 'business',
    subscriptionStatus: 'active',
    subscriptionEndsAt: null,
    catalogId: 'catalog-grill',
    catalogName: 'Grill House',
    catalogSlug: 'grill-house',
    catalogStatus: 'published',
    templateName: 'Restaurant Modern',
    templateKey: 'restaurant-modern',
    templateVersion: 1,
    businessType: 'restaurant',
    logoUrl: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-coffee',
    companyName: 'Coffee Time',
    ownerName: 'Марина',
    email: 'hello@coffeetime.com',
    phone: '+7 999 987-65-43',
    primaryCity: 'Аргун',
    serviceSettlements: ['Центр', 'Новая жизнь'],
    status: 'active',
    planCode: 'trial',
    subscriptionStatus: 'trial',
    subscriptionEndsAt: null,
    catalogId: 'catalog-coffee',
    catalogName: 'Coffee Time',
    catalogSlug: 'coffee-time',
    catalogStatus: 'published',
    templateName: 'Restaurant Modern',
    templateKey: 'restaurant-modern',
    templateVersion: 2,
    businessType: 'cafe',
    logoUrl: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-gym',
    companyName: 'FitLife Gym',
    ownerName: '',
    email: 'admin@fitlife.com',
    phone: '+7 999 111-22-33',
    primaryCity: '',
    serviceSettlements: [],
    status: 'inactive',
    planCode: 'basic',
    subscriptionStatus: 'expired',
    subscriptionEndsAt: null,
    catalogId: 'catalog-fitlife',
    catalogName: 'FitLife Gym',
    catalogSlug: 'fitlife-gym',
    catalogStatus: 'draft',
    templateName: 'Menswear Premium',
    templateKey: 'menswear-premium',
    templateVersion: 1,
    businessType: 'fitness',
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
  title: string;
  subtitle: string;
  kind: PlatformBannerAdmin['kind'];
  image_url: string;
  link_url: string;
  sort_order: number;
  is_active: boolean;
};

type ContestOrderRow = {
  id: string;
  client_name?: string | null;
  client_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
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
  businessType: row.catalogs?.template_versions?.templates?.business_type ?? 'restaurant',
  logoUrl: row.catalogs?.logo_url ?? '',
  createdAt: row.created_at
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
  phone: row.email ?? '',
  source: 'auth_user',
  createdAt: row.created_at
});

const mapPlatformBanner = (row: PlatformBannerRow): PlatformBannerAdmin => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  kind: row.kind,
  imageUrl: row.image_url,
  linkUrl: row.link_url,
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
      'id, company_name, owner_name, email, phone, primary_city, service_settlements, status, plan_code, subscription_status, subscription_ends_at, created_at, catalogs(id, name, slug, status, logo_url, template_versions(version, templates(key, name, business_type)))',
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

  const ordersResult = await supabase
    .from('orders')
    .select('catalog_id, total, total_amount, delivery_provider, status')
    .limit(1000);
  const fallbackOrdersResult = ordersResult.error
    ? await supabase.from('orders').select('catalog_id, total, status').limit(1000)
    : null;
  const orderRows = ((ordersResult.data ?? fallbackOrdersResult?.data ?? []) as PlatformOrderStatsRow[]);

  return summarizePlatformStats(clients.data, orderRows);
}

export async function getClientSignups(): Promise<ClientSignup[]> {
  if (!supabase) return demoClientSignups;

  const signupsResult = await supabase
    .from('client_signups')
    .select('id, name, phone, source, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (signupsResult.error) throw signupsResult.error;

  const profilesResult = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const signups = ((signupsResult.data ?? []) as ClientSignupRow[]).map(mapClientSignup);
  const profileSignups = profilesResult.error
    ? []
    : ((profilesResult.data ?? []) as ProfileSignupRow[]).map(mapProfileSignup);
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

export async function deleteClientSignup(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('client_signups').delete().eq('id', id);
  if (error) throw error;
}

export async function getPlatformGlobalSettings(): Promise<PlatformGlobalSettings> {
  if (!supabase) return { supportWhatsapp: '79990000000' };

  const { data, error } = await supabase
    .from('platform_settings')
    .select('support_whatsapp')
    .eq('id', 'global')
    .maybeSingle();
  if (error) throw error;
  return { supportWhatsapp: (data as { support_whatsapp?: string } | null)?.support_whatsapp ?? '' };
}

export async function savePlatformGlobalSettings(settings: PlatformGlobalSettings) {
  if (!supabase) return;
  const { error } = await supabase.from('platform_settings').upsert({
    id: 'global',
    support_whatsapp: settings.supportWhatsapp,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function getPlatformBanners(): Promise<PlatformBannerAdmin[]> {
  if (!supabase) {
    return [{
      id: 'demo-banner',
      title: 'Конкурс от WayCatalog',
      subtitle: 'Закажи на 1000₽ и выиграй приз',
      kind: 'contest',
      imageUrl: '',
      linkUrl: '/restaurants',
      sortOrder: 0,
      isActive: true
    }];
  }

  const { data, error } = await supabase
    .from('platform_banners')
    .select('id, title, subtitle, kind, image_url, link_url, sort_order, is_active')
    .order('sort_order');
  if (error) throw error;
  return ((data ?? []) as PlatformBannerRow[]).map(mapPlatformBanner);
}

export async function savePlatformBanner(banner: Omit<PlatformBannerAdmin, 'id'> & { id?: string }) {
  if (!supabase) return;
  const payload = {
    title: banner.title,
    subtitle: banner.subtitle,
    kind: banner.kind,
    image_url: banner.imageUrl,
    link_url: banner.linkUrl,
    sort_order: banner.sortOrder,
    is_active: banner.isActive
  };
  const query = banner.id
    ? supabase.from('platform_banners').update(payload).eq('id', banner.id)
    : supabase.from('platform_banners').insert(payload);
  const { error } = await query;
  if (error) throw error;
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
      totalAmount: 1470,
      orderedItems: ['Шашлык из баранины x 1', 'Чеченский чай x 1'],
      createdAt: new Date().toISOString()
    }].filter((ticket) => !hiddenIds.has(ticket.id));
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id, client_name, client_phone, customer_name, customer_phone, total, total_amount, created_at, restaurants(name), order_items(quantity, dish_name_snapshot, title)')
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
        totalAmount: Number(order.total_amount ?? order.total ?? 0),
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
