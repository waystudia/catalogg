import { describe, expect, it } from 'vitest';
import {
  getPlatformContentPath,
  normalizeContentSlug,
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
});
