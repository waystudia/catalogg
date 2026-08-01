import { describe, expect, it } from 'vitest';
import { isPublicMenuCategory } from '../../src/entities/publicCategoryVisibility';

describe('public category visibility', () => {
  it('hides cabin and other space categories from public category lists', () => {
    expect(isPublicMenuCategory({ slug: 'cabins', kind: 'food' })).toBe(false);
    expect(isPublicMenuCategory({ slug: '  CABINS  ', kind: 'food' })).toBe(false);
    expect(isPublicMenuCategory({ slug: 'private-hall', kind: 'space' })).toBe(false);
  });

  it('keeps ordinary food and drink categories public', () => {
    expect(isPublicMenuCategory({ slug: 'pizza', kind: 'food' })).toBe(true);
    expect(isPublicMenuCategory({ slug: 'coffee', kind: 'drink' })).toBe(true);
    expect(isPublicMenuCategory({ kind: 'food' })).toBe(true);
  });
});
