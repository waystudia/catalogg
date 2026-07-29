import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPlatformContentPath,
  normalizeContentSlug,
  validatePlatformContentPage
} from './platformContent';

describe('platform content pages', () => {
  it('normalizes a human-entered slug and builds the internal client path', () => {
    assert.equal(normalizeContentSlug('  Конкурс № 1 / iPhone  '), 'contest-1-iphone');
    assert.equal(getPlatformContentPath('contest-1-iphone'), '/pages/contest-1-iphone');
    assert.equal(normalizeContentSlug('___Alpha___Beta___'), 'alpha-beta');
    assert.equal(
      normalizeContentSlug('абвгдеёжзийклмнопрстуфхцчшщъыьэюя'),
      'abvgdeezhziiklmnoprstufhcchshschyeyuya'
    );
  });

  it('rejects empty page names and slugs before saving', () => {
    assert.throws(
      () => validatePlatformContentPage({ name: '', slug: 'contest-1', blocks: [] }),
      /название страницы/i
    );
    assert.throws(
      () => validatePlatformContentPage({ name: 'Конкурс', slug: '', blocks: [] }),
      /slug/i
    );
  });

  it('preserves reusable ordered blocks in a valid page draft', () => {
    const blocks = [
      { id: 'title-1', type: 'heading' as const, content: 'Конкурс №1', url: '', label: '' },
      { id: 'text-1', type: 'text' as const, content: 'Условия конкурса', url: '', label: '' }
    ];

    assert.deepEqual(
      validatePlatformContentPage({ name: 'Конкурс на iPhone', slug: 'contest-1', blocks }),
      {
        name: 'Конкурс на iPhone',
        slug: 'contest-1',
        blocks
      }
    );
  });
});
