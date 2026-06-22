import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cabins, categories, products, restaurant, themeSettings } from '../data/catalog';

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

export async function loadCatalog() {
  if (!supabase) {
    return { restaurant, categories, products, cabins, theme: themeSettings, source: 'demo' as const };
  }

  const [restaurantResult, categoriesResult, productsResult, themeResult] = await Promise.all([
    supabase.from('restaurant').select('*').limit(1).single(),
    supabase.from('category').select('*').order('name'),
    supabase.from('product').select('*').order('title'),
    supabase.from('theme_settings').select('*').limit(1).single()
  ]);

  return {
    restaurant: restaurantResult.data ?? restaurant,
    categories: categoriesResult.data ?? categories,
    products: productsResult.data ?? products,
    cabins,
    theme: themeResult.data ?? themeSettings,
    source: 'supabase' as const
  };
}
