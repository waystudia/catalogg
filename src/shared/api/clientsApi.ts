import { supabase } from '../supabase';
import type {
  ClientListParams,
  CreateClientPayload,
  CreateClientResult,
  PlatformClient,
  PlatformStats,
  UpdateClientPayload,
  UpdateClientResult
} from './platformTypes';

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
  const clients = await getClients({ page: 1, pageSize: 50, status: 'all', payment: 'all', templateId: 'all' });
  return {
    totalClients: clients.count,
    activeCatalogs: clients.data.filter((client) => client.catalogStatus === 'published').length,
    monthlyRevenue: 0,
    monthlyViews: 0
  };
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
