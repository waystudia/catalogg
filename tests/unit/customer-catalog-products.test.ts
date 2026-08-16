import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/entities/models';
import { getCustomerCatalogProducts } from '../../src/entities/customerCatalogProducts';

const product = (id: string, patch: Partial<Product> = {}): Product => ({
  id,
  title: id,
  price: 100,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 10,
  category_id: 'main',
  pair_ids: [],
  ...patch
});

describe('customer catalog product cards', () => {
  it('replaces a source card with its separately published option cards', () => {
    const source = product('pizza', { publish_choice_cards: true });
    const medium = product('pizza-medium', { generated_from_choice: source.id, generated_choice_index: 0 });
    const large = product('pizza-large', { generated_from_choice: source.id, generated_choice_index: 1 });

    expect(getCustomerCatalogProducts([source, medium, large]).map(({ id }) => id)).toEqual([
      'pizza-medium',
      'pizza-large'
    ]);
  });

  it('keeps a source visible until generated cards exist and excludes hidden products', () => {
    const source = product('milk', { publish_choice_cards: true });
    const hidden = product('hidden', { is_hidden: true });

    expect(getCustomerCatalogProducts([source, hidden]).map(({ id }) => id)).toEqual(['milk']);
  });
});
