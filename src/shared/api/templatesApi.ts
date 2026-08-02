import { supabase } from '../supabase';
import { normalizeBusinessType } from '../businessTerminology';
import type { CreateRestaurantTemplatePayload, PlatformTemplateOption } from './platformTypes';

export const platformFallbackTemplates: PlatformTemplateOption[] = [
  {
    templateVersionId: '00000000-0000-4000-8000-000000000002',
    templateKey: 'restaurant-modern',
    templateName: 'Restaurant Modern',
    businessType: 'restaurant',
    version: 2,
    description: 'Ресторанный шаблон каталога, который используется для Мангал.',
    previewImage: '/catalogg/assets/template-fast-food/hero.jpg'
  },
  {
    templateVersionId: '00000000-0000-4000-8000-000000000003',
    templateKey: 'coffee-shop',
    templateName: 'Кофейня WayYaam',
    businessType: 'coffee_shop',
    version: 1,
    description: 'Готовый шаблон кофейни с напитками, десертами и модификаторами.',
    templateCatalogSlug: 'coffee-shop',
    isCatalogTemplate: true,
    previewImage: '/catalogg/assets/template-coffee-shop/hero.webp'
  },
  {
    templateVersionId: '00000000-0000-4000-8000-000000000004',
    templateKey: 'confectionery',
    templateName: 'Кондитерская',
    businessType: 'confectionery',
    version: 1,
    description: 'Торты, десерты, выпечка и подарочные наборы',
    templateCatalogSlug: 'confectionery',
    isCatalogTemplate: true,
    previewImage: '/catalogg/assets/templates/confectionery/preview.webp'
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
  businessType: normalizeBusinessType(row.business_type ?? row.template_versions?.templates?.business_type),
  version: row.template_versions?.version ?? 1,
  description: row.description || row.template_versions?.templates?.description || 'Настраиваемый ресторанный шаблон',
  templateCatalogSlug: row.slug,
  isCatalogTemplate: true,
  previewImage: row.slug === 'confectionery'
    ? '/catalogg/assets/templates/confectionery/preview.webp'
    : row.business_type === 'coffee_shop'
      ? '/catalogg/assets/template-coffee-shop/hero.webp'
      : undefined
});

const templateOrder: Record<string, number> = { restaurant: 0, coffee_shop: 1, confectionery: 2 };

export async function getTemplateOptions(): Promise<PlatformTemplateOption[]> {
  if (!supabase) return platformFallbackTemplates;

  const catalogTemplates = await supabase
    .from('catalogs')
    .select('id, slug, name, description, template_name, business_type, template_versions(version, templates(key, name, business_type, description))')
    .eq('is_template', true)
    .order('created_at', { ascending: false });

  if (!catalogTemplates.error && catalogTemplates.data?.length) {
    return (catalogTemplates.data as TemplateCatalogRow[])
      .map(mapTemplateCatalog)
      .sort((left, right) => (templateOrder[left.businessType] ?? 99) - (templateOrder[right.businessType] ?? 99));
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
      businessType: normalizeBusinessType(row.templates?.business_type),
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

export async function deleteRestaurantTemplate(catalogId: string): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('catalogs')
    .delete()
    .eq('id', catalogId)
    .eq('is_template', true)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Шаблон не найден или уже удалён. Обычные каталоги не затронуты.');
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
