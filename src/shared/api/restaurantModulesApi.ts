import {
  createDefaultRestaurantModules,
  getRestaurantAdminModuleAccess,
  type RestaurantAdminModuleAccess,
  type RestaurantModules,
  type RestaurantModulePackage
} from '../../features/platform-admin-modules/restaurantModuleAccess';
import { getClients } from './clientsApi';
import { getCatalogAdminAccess } from './catalogAdminApi';
import type { SubscriptionStatus } from './platformTypes';
import { supabase } from '../supabase';

export type RestaurantModuleEntitlement = RestaurantModules;

export type RestaurantModuleRestaurant = {
  catalogId: string;
  name: string;
  slug: string;
  planCode: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
};

type RestaurantModulesRow = {
  catalog_id: string;
  package_code: RestaurantModulePackage;
  pos_enabled: boolean;
  warehouse_enabled: boolean;
  recipes_enabled: boolean;
  finance_enabled: boolean;
  promotions_enabled: boolean;
  loyalty_enabled: boolean;
  max_cashiers: number;
  max_devices: number;
  max_locations: number;
  max_warehouses: number;
};

const localStorageKey = 'wayyaam:restaurant-modules:v1';

const mapRow = (row: RestaurantModulesRow): RestaurantModuleEntitlement => ({
  catalogId: row.catalog_id,
  packageCode: row.package_code,
  posEnabled: row.pos_enabled,
  warehouseEnabled: row.warehouse_enabled,
  recipesEnabled: row.recipes_enabled,
  financeEnabled: row.finance_enabled,
  promotionsEnabled: row.promotions_enabled,
  loyaltyEnabled: row.loyalty_enabled,
  maxCashiers: row.max_cashiers,
  maxDevices: row.max_devices,
  maxLocations: row.max_locations,
  maxWarehouses: row.max_warehouses
});

const toRow = (value: RestaurantModuleEntitlement): RestaurantModulesRow => ({
  catalog_id: value.catalogId,
  package_code: value.packageCode,
  pos_enabled: value.posEnabled,
  warehouse_enabled: value.warehouseEnabled,
  recipes_enabled: value.recipesEnabled,
  finance_enabled: value.financeEnabled,
  promotions_enabled: value.promotionsEnabled,
  loyalty_enabled: value.loyaltyEnabled,
  max_cashiers: value.maxCashiers,
  max_devices: value.maxDevices,
  max_locations: value.maxLocations,
  max_warehouses: value.maxWarehouses
});

const readLocalEntitlements = (): RestaurantModuleEntitlement[] => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(localStorageKey) ?? '[]') as RestaurantModuleEntitlement[];
  } catch {
    return [];
  }
};

export async function getRestaurantModuleRestaurants(): Promise<RestaurantModuleRestaurant[]> {
  const result = await getClients({ page: 1, pageSize: 1000, status: 'all', payment: 'all', templateId: 'all' });
  return result.data
    .filter((client) => Boolean(client.catalogId))
    .map((client) => ({
      catalogId: client.catalogId,
      name: client.companyName,
      slug: client.catalogSlug,
      planCode: client.planCode,
      subscriptionStatus: client.subscriptionStatus,
      subscriptionEndsAt: client.subscriptionEndsAt
    }));
}

export async function getRestaurantModuleEntitlements(): Promise<RestaurantModuleEntitlement[]> {
  if (!supabase) return readLocalEntitlements();
  const { data, error } = await supabase
    .from('restaurant_modules')
    .select('catalog_id, package_code, pos_enabled, warehouse_enabled, recipes_enabled, finance_enabled, promotions_enabled, loyalty_enabled, max_cashiers, max_devices, max_locations, max_warehouses');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RestaurantModulesRow[]).map(mapRow);
}

export async function getRestaurantModuleEntitlementByCatalog(
  catalogId: string
): Promise<RestaurantModuleEntitlement> {
  if (!supabase) {
    return readLocalEntitlements().find((item) => item.catalogId === catalogId)
      ?? createDefaultRestaurantModules(catalogId);
  }
  const { data, error } = await supabase
    .from('restaurant_modules')
    .select('catalog_id, package_code, pos_enabled, warehouse_enabled, recipes_enabled, finance_enabled, promotions_enabled, loyalty_enabled, max_cashiers, max_devices, max_locations, max_warehouses')
    .eq('catalog_id', catalogId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as RestaurantModulesRow) : createDefaultRestaurantModules(catalogId);
}

export async function saveRestaurantModuleEntitlement(
  value: RestaurantModuleEntitlement
): Promise<RestaurantModuleEntitlement> {
  if (!supabase) {
    const next = readLocalEntitlements().filter((item) => item.catalogId !== value.catalogId);
    next.push(value);
    window.localStorage.setItem(localStorageKey, JSON.stringify(next));
    return value;
  }
  const { data, error } = await supabase
    .from('restaurant_modules')
    .upsert(toRow(value), { onConflict: 'catalog_id' })
    .select('catalog_id, package_code, pos_enabled, warehouse_enabled, recipes_enabled, finance_enabled, promotions_enabled, loyalty_enabled, max_cashiers, max_devices, max_locations, max_warehouses')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as RestaurantModulesRow);
}

export async function getRestaurantAdminModuleAccessBySlug(
  catalogSlug: string
): Promise<RestaurantAdminModuleAccess> {
  const access = await getCatalogAdminAccess(catalogSlug);
  if (!access.catalog || !access.hasSession) {
    return { pos: 'disabled', warehouse: 'disabled' };
  }
  const modules = await getRestaurantModuleEntitlementByCatalog(access.catalog.id);
  return getRestaurantAdminModuleAccess({
    modules,
    status: access.subscriptionStatus,
    endsAt: access.subscriptionEndsAt
  });
}
