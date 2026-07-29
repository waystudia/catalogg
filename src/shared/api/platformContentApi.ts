import { getPlatformContentPath, validatePlatformContentPage } from '../platformContent';
import { supabase } from '../supabase';
import type { PlatformContentBlock, PlatformContentPage } from './platformTypes';

type PlatformContentPageRow = {
  id: string;
  name: string;
  slug: string;
  status: PlatformContentPage['status'];
  blocks: unknown;
  created_at: string;
  updated_at: string;
};

const isContentBlock = (value: unknown): value is PlatformContentBlock => {
  if (!value || typeof value !== 'object') return false;
  const block = value as Partial<PlatformContentBlock>;
  return typeof block.id === 'string'
    && typeof block.type === 'string'
    && typeof block.content === 'string'
    && typeof block.url === 'string'
    && typeof block.label === 'string';
};

const mapContentPage = (row: PlatformContentPageRow, usageCount: number): PlatformContentPage => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  blocks: Array.isArray(row.blocks) ? row.blocks.filter(isContentBlock) : [],
  bannerUsageCount: usageCount,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export async function getPlatformContentPages(options?: { publicOnly?: boolean }): Promise<PlatformContentPage[]> {
  if (!supabase) return [];

  let pagesQuery = supabase
    .from('platform_content_pages')
    .select('id, name, slug, status, blocks, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (options?.publicOnly) pagesQuery = pagesQuery.eq('status', 'published');

  const [pagesResult, bannersResult] = await Promise.all([
    pagesQuery,
    supabase.from('platform_banners').select('page_id').not('page_id', 'is', null)
  ]);
  if (pagesResult.error) return [];

  const usageByPage = new Map<string, number>();
  if (!bannersResult.error) {
    ((bannersResult.data ?? []) as Array<{ page_id: string | null }>).forEach(({ page_id: pageId }) => {
      if (pageId) usageByPage.set(pageId, (usageByPage.get(pageId) ?? 0) + 1);
    });
  }

  return ((pagesResult.data ?? []) as PlatformContentPageRow[])
    .map((row) => mapContentPage(row, usageByPage.get(row.id) ?? 0));
}

export async function savePlatformContentPage(input: {
  id?: string;
  name: string;
  slug: string;
  status: PlatformContentPage['status'];
  blocks: PlatformContentBlock[];
}): Promise<void> {
  const validated = validatePlatformContentPage(input);
  if (!supabase) return;

  const duplicateQuery = supabase
    .from('platform_content_pages')
    .select('id')
    .eq('slug', validated.slug)
    .limit(1);
  const { data: duplicateRows, error: duplicateError } = input.id
    ? await duplicateQuery.neq('id', input.id)
    : await duplicateQuery;
  if (duplicateError) throw duplicateError;
  if ((duplicateRows ?? []).length > 0) throw new Error('Страница с таким slug уже существует.');

  const payload = {
    name: validated.name,
    slug: validated.slug,
    status: validated.status,
    blocks: validated.blocks,
    updated_at: new Date().toISOString()
  };
  const result = input.id
    ? await supabase.from('platform_content_pages').update(payload).eq('id', input.id)
    : await supabase.from('platform_content_pages').insert(payload);
  if (result.error) {
    if (result.error.code === '23505') throw new Error('Страница с таким slug уже существует.');
    throw result.error;
  }
}

export async function deletePlatformContentPage(page: PlatformContentPage): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('platform_content_pages').delete().eq('id', page.id);
  if (error) throw error;
}

export const getContentPageClientPath = (page: Pick<PlatformContentPage, 'slug'>) =>
  getPlatformContentPath(page.slug);
