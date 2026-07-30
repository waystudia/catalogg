import type { PlatformContentBlock } from './api/platformTypes';

const cyrillicToLatin: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

export const normalizeContentSlug = (value: string) =>
  value
    .toLocaleLowerCase('ru-RU')
    .replace(/конкурс/g, 'contest')
    .split('')
    .map((character) => cyrillicToLatin[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const getPlatformContentPath = (slug: string) => `/pages/${normalizeContentSlug(slug)}`;

export const validatePlatformContentPage = <T extends {
  name: string;
  slug: string;
  blocks: PlatformContentBlock[];
  status?: 'draft' | 'published' | 'inactive';
  bannerUsageCount?: number;
}>(input: T): T => {
  const name = input.name.trim();
  const slug = normalizeContentSlug(input.slug);
  if (!name) throw new Error('Укажите название страницы.');
  if (!slug) throw new Error('Укажите корректный slug страницы.');
  if ((input.bannerUsageCount ?? 0) > 0 && input.status && input.status !== 'published') {
    throw new Error('Эта страница используется в материалах. Сначала отключите их или оставьте страницу опубликованной.');
  }
  return { ...input, name, slug };
};

export const validatePlatformBannerTarget = <T extends {
  status: 'draft' | 'published' | 'inactive';
}>(page: T | undefined, isActive: boolean): T => {
  if (!page) throw new Error('Выберите страницу при нажатии.');
  if (isActive && page.status !== 'published') {
    throw new Error('Сначала опубликуйте выбранную страницу.');
  }
  return page;
};
