import { describe, expect, it } from 'vitest';
import {
  getPlatformContentPath,
  normalizeContentSlug,
  validatePlatformBannerTarget,
  validatePlatformContentPage
} from '../../src/shared/platformContent';

describe('platform content page rules', () => {
  it('creates a stable internal route from Russian and mixed-case input', () => {
    expect(normalizeContentSlug('  Конкурс № 1 / iPhone  ')).toBe('contest-1-iphone');
    expect(getPlatformContentPath('contest-1-iphone')).toBe('/pages/contest-1-iphone');
    expect(normalizeContentSlug('___Alpha___Beta___')).toBe('alpha-beta');
    expect(normalizeContentSlug('абвгдеёжзийклмнопрстуфхцчшщъыьэюя'))
      .toBe('abvgdeezhziiklmnoprstufhcchshschyeyuya');
  });

  it('trims valid page metadata without changing ordered blocks', () => {
    const blocks = [
      { id: 'heading-1', type: 'heading' as const, content: 'Заголовок', url: '', label: '' }
    ];

    expect(validatePlatformContentPage({ name: '  Конкурс  ', slug: ' Contest-1 ', blocks })).toEqual({
      name: 'Конкурс',
      slug: 'contest-1',
      blocks
    });
  });

  it('rejects metadata that cannot produce a page route', () => {
    expect(() => validatePlatformContentPage({ name: ' ', slug: 'contest-1', blocks: [] })).toThrow(/название/i);
    expect(() => validatePlatformContentPage({ name: 'Конкурс', slug: '---', blocks: [] })).toThrow(/slug/i);
  });

  it('prevents an active banner from linking to a page clients cannot open', () => {
    const publishedPage = { id: 'published', name: 'Конкурс', slug: 'contest-1', status: 'published' as const };
    const draftPage = { id: 'draft', name: 'Черновик', slug: 'draft-1', status: 'draft' as const };

    expect(validatePlatformBannerTarget(publishedPage, true)).toBe(publishedPage);
    expect(validatePlatformBannerTarget(draftPage, false)).toBe(draftPage);
    expect(() => validatePlatformBannerTarget(draftPage, true)).toThrow(/опубликуйте/i);
    expect(() => validatePlatformBannerTarget(undefined, true)).toThrow(/выберите страницу/i);
  });

  it('prevents a linked page from being returned to draft or inactive status', () => {
    const shared = {
      name: 'Конкурс',
      slug: 'contest-1',
      blocks: [],
      bannerUsageCount: 2
    };

    expect(validatePlatformContentPage({ ...shared, status: 'published' as const }).status).toBe('published');
    expect(validatePlatformContentPage({
      ...shared,
      status: 'draft' as const,
      bannerUsageCount: 0
    }).status).toBe('draft');
    expect(() => validatePlatformContentPage({ ...shared, status: 'draft' as const })).toThrow(/используется/i);
    expect(() => validatePlatformContentPage({ ...shared, status: 'inactive' as const })).toThrow(/используется/i);
  });
});
