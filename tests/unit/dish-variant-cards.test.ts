import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/entities/models';
import {
  getDishProductRemovalIds,
  mergeDishProductChanges,
  persistDishProductChanges,
  synchronizeDishVariantCards
} from '../../src/features/dish-editor/dishVariantCards';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'source-dish',
  title: 'Острые крылышки',
  price: 500,
  description: '',
  image_url: '/wings.webp',
  image_urls: ['/wings.webp'],
  ingredients: '',
  weight: '300 г',
  spicy_level: 1,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 8,
  category_id: 'meat',
  category_ids: ['meat'],
  pair_ids: [],
  choice_options: [],
  ...overrides
});

describe('dish variant catalog cards', () => {
  it('merges saved cards and removes the source card family without touching another dish', () => {
    const source = product();
    const sourceCard = product({ id: 'source-card', generated_from_choice: source.id, generated_choice_index: 0 });
    const otherCard = product({ id: 'other-card', generated_from_choice: 'other-source', generated_choice_index: 0 });
    const replacement = product({ id: 'replacement', generated_from_choice: source.id, generated_choice_index: 0 });

    expect(mergeDishProductChanges([source, sourceCard, otherCard], [source, replacement], ['source-card']))
      .toEqual([replacement, source, otherCard]);
    expect(getDishProductRemovalIds([source, sourceCard, otherCard], source.id))
      .toEqual(['source-card', source.id]);
  });

  it('persists source and generated cards sequentially before removing stale cards', async () => {
    const events: string[] = [];
    const source = product();
    const generated = product({ id: 'generated-card' });

    await persistDishProductChanges([source, generated], ['stale-card'], {
      save: async (savedProduct) => {
        events.push(`save:start:${savedProduct.id}`);
        await Promise.resolve();
        events.push(`save:end:${savedProduct.id}`);
      },
      remove: async (productId) => {
        events.push(`remove:${productId}`);
      }
    });

    expect(events).toEqual([
      'save:start:source-dish',
      'save:end:source-dish',
      'save:start:generated-card',
      'save:end:generated-card',
      'remove:stale-card'
    ]);
  });

  it('keeps cards in sync by source and variant index', () => {
    const source = product({
      title: '  Острые крылышки  ',
      publish_choice_cards: true,
      choice_options: [
        { name: 'острые', price: 650 },
        { name: '6 шт', price: 790 },
        { name: 'XL 2', price: 890 }
      ]
    });
    const existingFirst = product({
      id: 'existing-first',
      generated_from_choice: source.id,
      generated_choice_index: 0
    });
    const stale = product({
      id: 'stale-third',
      generated_from_choice: source.id,
      generated_choice_index: 4
    });
    const anotherDishCard = product({
      id: 'other-source-card',
      generated_from_choice: 'another-dish',
      generated_choice_index: 0
    });

    const result = synchronizeDishVariantCards(source, [source, existingFirst, stale, anotherDishCard]);

    expect(result.generatedProducts).toEqual([
      expect.objectContaining({
        id: 'existing-first',
        title: 'Острые крылышки острые',
        price: 650,
        choice_options: [],
        publish_choice_cards: false,
        generated_from_choice: source.id,
        generated_choice_index: 0
      }),
      expect.objectContaining({
        title: 'Острые крылышки, 6 шт',
        price: 790,
        generated_from_choice: source.id,
        generated_choice_index: 1
      }),
      expect.objectContaining({
        title: 'Острые крылышки XL 2',
        price: 890,
        generated_choice_index: 2
      })
    ]);
    expect(result.generatedProducts[1]?.id).not.toBe(source.id);
    expect(result.generatedProducts[1]?.id).not.toBe('existing-first');
    expect(result.generatedProducts[1]?.id).not.toBe('stale-third');
    expect(result.generatedProducts[2]?.id).not.toBe('existing-first');
    expect(result.removedProductIds).toEqual(['stale-third']);
  });

  it('inherits the complete dish presentation, grouping, labels, serving and modifiers', () => {
    const source = product({
      publish_choice_cards: true,
      choice_options: [{ name: 'большая', price: 900 }],
      description: 'Сочная пицца на тонком тесте',
      ingredients: 'Томаты, сыр, базилик',
      image_url: '/margherita.webp',
      image_urls: ['/margherita.webp', '/margherita-side.webp'],
      serving: 'Подаётся с фирменным соусом',
      category_id: 'pizza',
      category_ids: ['pizza', 'popular'],
      pair_ids: ['cola', 'fries'],
      spicy_level: 2,
      is_popular: true,
      is_new: true,
      is_hit: true,
      badges: ['Выбор шефа'],
      allergens: ['глютен', 'молоко'],
      preparation_time: '25 мин',
      modifier_groups: [{
        id: 'sauces',
        name: 'Соус',
        required: false,
        minSelected: 0,
        maxSelected: 1,
        options: [{ id: 'cheese', name: 'Сырный', priceDelta: 50 }]
      }]
    });

    const generated = synchronizeDishVariantCards(source, [source]).generatedProducts[0];

    expect(generated).toEqual(expect.objectContaining({
      title: 'Острые крылышки большая',
      description: source.description,
      ingredients: source.ingredients,
      image_url: source.image_url,
      image_urls: source.image_urls,
      serving: source.serving,
      category_id: source.category_id,
      category_ids: source.category_ids,
      pair_ids: source.pair_ids,
      spicy_level: source.spicy_level,
      is_popular: true,
      is_new: true,
      is_hit: true,
      badges: source.badges,
      allergens: source.allergens,
      preparation_time: source.preparation_time,
      modifier_groups: source.modifier_groups
    }));
  });

  it('removes only generated cards for this dish when publishing is disabled', () => {
    const source = product({
      publish_choice_cards: false,
      choice_options: [{ name: '6 шт', price: 790 }]
    });
    const ownCard = product({ id: 'own-card', generated_from_choice: source.id, generated_choice_index: 0 });
    const otherCard = product({ id: 'other-card', generated_from_choice: 'other-source', generated_choice_index: 0 });

    expect(synchronizeDishVariantCards(source, [ownCard, otherCard])).toEqual({
      generatedProducts: [],
      removedProductIds: ['own-card']
    });
  });
});
