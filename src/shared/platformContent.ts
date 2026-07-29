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
}>(input: T): T => {
  const name = input.name.trim();
  const slug = normalizeContentSlug(input.slug);
  if (!name) throw new Error('Укажите название страницы.');
  if (!slug) throw new Error('Укажите корректный slug страницы.');
  return { ...input, name, slug };
};
