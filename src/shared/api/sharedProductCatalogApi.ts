import type { SharedProduct } from '../../entities/sharedProducts';
import { isValidGlobalBarcode } from '../../entities/sharedProducts';
import { supabase } from '../supabase';

type SharedProductRow = {
  id: string;
  title: string;
  brand: string | null;
  description: string | null;
  ingredients: string | null;
  allergens: string[] | null;
  country_of_origin: string | null;
  net_content_value: number | string | null;
  net_content_unit: string | null;
  category_id: string | null;
  category_name: string | null;
  barcode: string;
  normalized_barcode: string;
  image_url: string | null;
  version: number;
  status: SharedProduct['status'];
};

export type MasterCategory = {
  id: string;
  parentId: string | null;
  name: string;
};

export type SubmitSharedProductInput = {
  catalogId?: string | null;
  barcode: string;
  title: string;
  masterCategoryId?: string | null;
  imageUrl?: string | null;
  product?: {
    brand?: string;
    manufacturer?: string;
    description?: string;
    ingredients?: string;
    allergens?: string[];
    countryOfOrigin?: string;
    netContentValue?: number;
    netContentUnit?: 'g' | 'kg' | 'ml' | 'l' | 'piece';
    shelfLife?: string;
    attributes?: Record<string, unknown>;
  };
};

export type AddedSharedProduct = {
  masterProductId: string;
  productId: string;
  created: boolean;
};

export type SearchSharedProductsInput = {
  query?: string;
  categoryId?: string | null;
  limit?: number;
  offset?: number;
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase не настроен');
  return supabase;
};

export const mapSharedProductRow = (row: SharedProductRow): SharedProduct => ({
  id: row.id,
  title: row.title,
  brand: row.brand,
  description: row.description,
  ingredients: row.ingredients,
  allergens: row.allergens ?? [],
  countryOfOrigin: row.country_of_origin,
  netContentValue: row.net_content_value === null ? null : Number(row.net_content_value),
  netContentUnit: row.net_content_unit,
  categoryId: row.category_id,
  categoryName: row.category_name,
  barcode: row.barcode,
  normalizedBarcode: row.normalized_barcode,
  imageUrl: row.image_url,
  version: row.version,
  status: row.status
});

export async function lookupSharedProductByBarcode(barcode: string): Promise<SharedProduct | null> {
  if (!isValidGlobalBarcode(barcode)) return null;

  const { data, error } = await requireSupabase().rpc('lookup_shared_product_by_barcode', {
    target_barcode: barcode
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] as SharedProductRow | undefined : undefined;
  return row ? mapSharedProductRow(row) : null;
}

export async function searchSharedProducts(input: SearchSharedProductsInput = {}): Promise<SharedProduct[]> {
  const { data, error } = await requireSupabase().rpc('search_shared_products', {
    target_query: input.query?.trim() ?? '',
    target_category_id: input.categoryId ?? null,
    target_limit: Math.min(100, Math.max(1, input.limit ?? 50)),
    target_offset: Math.max(0, input.offset ?? 0)
  });

  if (error) throw error;
  return ((data ?? []) as SharedProductRow[]).map(mapSharedProductRow);
}

export async function listMasterCategories(): Promise<MasterCategory[]> {
  const { data, error } = await requireSupabase()
    .from('master_categories')
    .select('id, parent_id, name')
    .eq('status', 'active')
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name)
  }));
}

export async function createSharedProductCategory(input: {
  catalogId?: string | null;
  name: string;
  parentId?: string | null;
}): Promise<string> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) {
    throw new Error('Название группы должно содержать от 2 до 80 символов');
  }

  const { data, error } = await requireSupabase().rpc('create_shared_product_category', {
    target_catalog_id: input.catalogId ?? null,
    target_name: name,
    target_parent_id: input.parentId ?? null
  });

  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Сервис не вернул идентификатор общей группы');
  return data;
}

export async function uploadSharedProductImage(input: {
  catalogId?: string | null;
  file: File;
}): Promise<{ url: string; storagePath: string }> {
  if (!input.file.type.startsWith('image/')) throw new Error('Выберите изображение товара');
  if (input.file.size > 10 * 1024 * 1024) throw new Error('Фотография должна быть меньше 10 МБ');

  const extension = input.file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const ownerPath = input.catalogId ?? 'platform';
  const storagePath = `${ownerPath}/shared-products/${crypto.randomUUID()}.${extension}`;
  const client = requireSupabase();
  const { error } = await client.storage.from('catalog-assets').upload(storagePath, input.file, {
    cacheControl: '31536000',
    contentType: input.file.type,
    upsert: false
  });
  if (error) throw error;

  const { data } = client.storage.from('catalog-assets').getPublicUrl(storagePath);
  return { url: data.publicUrl, storagePath };
}

export async function submitSharedProduct(input: SubmitSharedProductInput): Promise<string> {
  if (!isValidGlobalBarcode(input.barcode)) {
    throw new Error('Некорректный глобальный штрих-код');
  }

  const productData = input.product ?? {};
  const { data, error } = await requireSupabase().rpc('submit_shared_product', {
    target_catalog_id: input.catalogId ?? null,
    target_barcode: input.barcode,
    target_title: input.title.trim(),
    target_master_category_id: input.masterCategoryId ?? null,
    target_product_data: {
      brand: productData.brand,
      manufacturer: productData.manufacturer,
      description: productData.description,
      ingredients: productData.ingredients,
      allergens: productData.allergens,
      country_of_origin: productData.countryOfOrigin,
      net_content_value: productData.netContentValue,
      net_content_unit: productData.netContentUnit,
      shelf_life: productData.shelfLife,
      attributes: productData.attributes ?? {}
    },
    target_image_url: input.imageUrl ?? null
  });

  if (error) {
    if (error.message.includes('shared_barcode_already_exists')) {
      const existingTitle = error.hint?.trim();
      throw new Error(existingTitle
        ? `Этот штрих‑код уже принадлежит товару «${existingTitle}». Другой товар с этим кодом создать нельзя.`
        : 'Этот штрих‑код уже зарегистрирован. Другой товар с этим кодом создать нельзя.');
    }
    throw error;
  }
  if (typeof data !== 'string') throw new Error('Сервис не вернул идентификатор общего товара');
  return data;
}

export async function addSharedProductsToCatalog(
  catalogId: string,
  masterProductIds: readonly string[]
): Promise<AddedSharedProduct[]> {
  const uniqueIds = [...new Set(masterProductIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  if (uniqueIds.length > 500) throw new Error('За один раз можно добавить не более 500 товаров');

  const { data, error } = await requireSupabase().rpc('bulk_add_shared_products_to_catalog', {
    target_catalog_id: catalogId,
    target_master_product_ids: uniqueIds
  });

  if (error) throw error;
  return ((data ?? []) as Array<{
    master_product_id: string;
    product_id: string;
    created: boolean;
  }>).map((row) => ({
    masterProductId: row.master_product_id,
    productId: row.product_id,
    created: row.created
  }));
}
