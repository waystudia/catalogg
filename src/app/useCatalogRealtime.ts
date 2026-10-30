import { useEffect } from 'react';
import { invalidatePublicMenuCache, supabase } from '../shared/supabase';

export function useCatalogRealtime(slug: string, refreshCatalog: () => void, refreshDeliverySettings: () => void) {
  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;
    const refresh = () => { invalidatePublicMenuCache(); refreshCatalog(); };
    const channel = client.channel(`catalog-refresh-${slug}`);
    const tables = ['category', 'categories', 'product', 'products', 'restaurant', 'restaurants', 'catalogs',
      'catalog_tag', 'tags', 'theme_settings', 'catalog_theme_settings', 'catalog_sections', 'product_images',
      'product_option_groups', 'product_options', 'bookable_resources'];
    tables.forEach(table => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_delivery_settings' }, refreshDeliverySettings);
    channel.subscribe();
    return () => { void client.removeChannel(channel); };
  }, [slug, refreshCatalog, refreshDeliverySettings]);
}
