import { supabase } from '../supabase';
import type { CreateRestaurantTemplatePayload, PlatformTemplateOption } from './platformTypes';

const fallbackTemplates: PlatformTemplateOption[] = [
  {
    templateVersionId: '00000000-0000-4000-8000-000000000002',
    templateKey: 'restaurant-modern',
    templateName: 'Restaurant Modern',
    businessType: 'restaurant',
    version: 2,
    description: 'Ресторанный шаблон каталога, который используется для Мангал.'
  },
  {
    templateVersionId: '00000000-0000-4000-8000-000000000003',
    templateKey: 'coffee-shop',
    templateName: 'Кофейня WayYaam',
    businessType: 'coffee_shop',
    version: 1,
    description: 'Готовый шаблон кофейни с напитками, десертами и модификаторами.',
    templateCatalogSlug: 'coffee-shop',
    isCatalogTemplate: true
  }
];

type TemplateVersionRow = {
  id: string;
  version: number;
  status: string;
  templates?: {
    key?: string;
    name?: string;
    business_type?: string;
    description?: string;
  } | null;
};

type TemplateCatalogRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  template_name?: string | null;
  business_type?: string | null;
  template_versions?: {
    version?: number;
    templates?: {
      key?: string;
      name?: string;
      business_type?: string;
      description?: string;
    } | null;
  } | null;
};

const mapTemplateCatalog = (row: TemplateCatalogRow): PlatformTemplateOption => ({
  templateVersionId: row.id,
  templateKey: row.template_name ?? row.slug,
  templateName: row.name,
  businessType: row.business_type === 'coffee_shop' ? 'coffee_shop' : row.template_versions?.templates?.business_type ?? 'restaurant',
  version: row.template_versions?.version ?? 1,
  description: row.description || row.template_versions?.templates?.description || 'Настраиваемый ресторанный шаблон',
  templateCatalogSlug: row.slug,
  isCatalogTemplate: true
});

export async function getTemplateOptions(): Promise<PlatformTemplateOption[]> {
  if (!supabase) return fallbackTemplates;

  const catalogTemplates = await supabase
    .from('catalogs')
    .select('id, slug, name, description, template_name, business_type, template_versions(version, templates(key, name, business_type, description))')
    .eq('is_template', true)
    .order('created_at', { ascending: false });

  if (!catalogTemplates.error && catalogTemplates.data?.length) {
    return (catalogTemplates.data as TemplateCatalogRow[]).map(mapTemplateCatalog);
  }

  const { data, error } = await supabase
    .from('template_versions')
    .select('id, version, status, templates(key, name, business_type, description)')
    .eq('status', 'published')
    .order('version', { ascending: false });

  if (error) throw error;
  if (!data?.length) return [];

  const restaurantTemplates = (data as TemplateVersionRow[])
    .map((row) => ({
      templateVersionId: row.id,
      templateKey: row.templates?.key ?? 'restaurant-modern',
      templateName: row.templates?.name ?? 'Template',
      businessType: row.templates?.business_type ?? 'restaurant',
      version: row.version,
      description: row.templates?.description ?? ''
    }))
    .filter((template) => template.templateKey === 'restaurant-modern')
    .sort((first, second) => second.version - first.version);

  return restaurantTemplates.slice(0, 1);
}

export async function createRestaurantTemplate(payload: CreateRestaurantTemplatePayload): Promise<{ catalogId: string }> {
  if (!supabase) return { catalogId: crypto.randomUUID() };

  const { data, error } = await supabase.rpc('create_restaurant_template', {
    template_display_name: payload.name,
    template_slug: payload.slug,
    template_key: payload.templateName || payload.slug,
    created_by_user_id: null
  });

  if (error) throw error;
  return { catalogId: String(data) };
}

export async function publishCoffeeTemplateAssets(catalogId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase не настроен');
  const { data, error } = await supabase
    .from('products')
    .select('slug, categories!inner(slug)')
    .eq('catalog_id', catalogId)
    .order('sort_order');
  if (error) throw error;

  const products = (data ?? []).flatMap((row) => {
    const relation = row.categories as { slug?: string } | Array<{ slug?: string }> | null;
    const categorySlug = Array.isArray(relation) ? relation[0]?.slug : relation?.slug;
    return categorySlug && row.slug ? [{ categorySlug, productSlug: String(row.slug) }] : [];
  });
  const bucket = supabase.storage.from('catalog-assets');

  for (let index = 0; index < products.length; index += 6) {
    await Promise.all(products.slice(index, index + 6).map(async ({ categorySlug, productSlug }) => {
      const localPath = `${import.meta.env.BASE_URL}assets/template-coffee-shop/products/${categorySlug}/${productSlug}.webp`;
      const response = await fetch(localPath);
      if (!response.ok) throw new Error(`Не найден файл ${productSlug}.webp`);
      const blob = await response.blob();
      const storagePath = `${catalogId}/templates/coffee-shop/${categorySlug}/${productSlug}.webp`;
      const { error: uploadError } = await bucket.upload(storagePath, blob, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: true
      });
      if (uploadError) throw uploadError;
    }));
  }

  return products.length;
}
