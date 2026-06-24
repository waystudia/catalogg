import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cabins, categories, products, restaurant, themeSettings } from '../data/catalog';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../entities/models';

type SupabaseConfig = {
  url?: string;
  anonKey?: string;
};

const config: SupabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
};

export const supabase: SupabaseClient | null =
  config.url && config.anonKey ? createClient(config.url, config.anonKey) : null;

export async function signInAdmin(email: string, password: string) {
  if (!supabase) {
    return email.trim().toLowerCase() === 'admin' && password.trim() === '1234';
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) return false;

  const isAdmin = await hasAdminSession();
  if (!isAdmin) {
    await supabase.auth.signOut();
  }
  return isAdmin;
}

export async function signOutAdmin() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function hasAdminSession() {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;

  const { data: adminUser } = await supabase.from('admin_user').select('user_id').limit(1).maybeSingle();
  return Boolean(adminUser);
}

export function onAdminSessionChange(callback: (isAdmin: boolean) => void) {
  if (!supabase) return () => undefined;

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      callback(false);
      return;
    }
    void hasAdminSession().then(callback);
  });

  return () => data.subscription.unsubscribe();
}

export async function loadCatalog() {
  if (!supabase) {
    return { restaurant, categories, products, cabins, tags: [], theme: themeSettings, source: 'demo' as const };
  }

  const [restaurantResult, categoriesResult, productsResult, cabinsResult, tagsResult, themeResult] = await Promise.all([
    supabase.from('restaurant').select('*').limit(1).single(),
    supabase.from('category').select('*').order('sort_order', { ascending: true }).order('name'),
    supabase.from('product').select('*').order('sort_order', { ascending: true }).order('title'),
    supabase.from('cabin').select('*').order('sort_order', { ascending: true }).order('title'),
    supabase.from('catalog_tag').select('*').order('sort_order', { ascending: true }).order('name'),
    supabase.from('theme_settings').select('*').limit(1).single()
  ]);

  return {
    restaurant: restaurantResult.data ?? restaurant,
    categories: categoriesResult.data ?? categories,
    products: productsResult.data ?? products,
    cabins: cabinsResult.data ?? cabins,
    tags: tagsResult.data ?? [],
    theme: themeResult.data ?? themeSettings,
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

export async function saveProductToSupabase(product: Product) {
  if (!supabase) return;
  await throwOnError(supabase.from('product').upsert(product, { onConflict: 'id' }));
}

export async function updateProductInSupabase(productId: string, patch: Partial<Product>) {
  if (!supabase) return;
  await throwOnError(supabase.from('product').update(patch).eq('id', productId));
}

export async function deleteProductFromSupabase(productId: string) {
  if (!supabase) return;
  await throwOnError(supabase.from('product').delete().eq('id', productId));
}

export async function saveRestaurantToSupabase(value: Restaurant) {
  if (!supabase) return;
  await throwOnError(supabase.from('restaurant').upsert(value, { onConflict: 'id' }));
}

export async function saveThemeToSupabase(value: ThemeSettings) {
  if (!supabase) return;
  await throwOnError(supabase.from('theme_settings').upsert(value, { onConflict: 'id' }));
}

export async function replaceCategoriesInSupabase(values: Category[]) {
  if (!supabase) return;
  const ids = values.map((value) => value.id);
  await throwOnError(supabase.from('category').upsert(values.map((value, index) => ({ ...value, sort_order: index })), { onConflict: 'id' }));
  if (ids.length > 0) {
    await throwOnError(supabase.from('category').delete().not('id', 'in', postgrestList(ids)));
  } else {
    await throwOnError(supabase.from('category').delete().neq('id', ''));
  }
}

export async function replaceTagsInSupabase(values: CatalogTag[]) {
  if (!supabase) return;
  const ids = values.map((value) => value.id);
  await throwOnError(supabase.from('catalog_tag').upsert(values.map((value, index) => ({ ...value, sort_order: index })), { onConflict: 'id' }));
  if (ids.length > 0) {
    await throwOnError(supabase.from('catalog_tag').delete().not('id', 'in', postgrestList(ids)));
  } else {
    await throwOnError(supabase.from('catalog_tag').delete().neq('id', ''));
  }
}

export async function replaceCabinsInSupabase(values: Cabin[]) {
  if (!supabase) return;
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
  if (payload.categories) await replaceCategoriesInSupabase(payload.categories);
  if (payload.tags) await replaceTagsInSupabase(payload.tags);
  if (payload.cabins) {
    await replaceCabinsInSupabase(payload.cabins);
  }
  if (payload.products) {
    await replaceProductsInSupabase(payload.products);
  }
}
