import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CartItem, Product } from '../../src/entities/models';
import {
  formatCatalogProductPrice,
  getCartItemPrice,
  getCartItemTotal,
  getProductStartingPrice,
  normalizeSelectedWeight
} from '../../src/entities/productPricing';
import { buildCartLineId, getMissingRequiredModifierGroup } from '../../src/entities/productModifiers';
import {
  confectioneryCategories,
  confectioneryProducts,
  confectioneryTemplate
} from '../../src/templates/confectionery';
import { buildPublicRestaurantOrderItems } from '../../src/shared/api/restaurantOrderPayload';
import { buildWhatsappOrderText } from '../../src/shared/whatsappOrder';
import { loadTemplate, registeredTemplates } from '../../src/templates/registry';
import { platformFallbackTemplates } from '../../src/shared/api/templatesApi';

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'cake-1',
  title: 'Торт',
  price: 1900,
  pricing_type: 'fixed',
  price_tier: 'standard',
  description: '',
  image_url: '',
  ingredients: '',
  allergens: [],
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_unlimited: true,
  stock_count: 0,
  category_id: 'cakes',
  pair_ids: [],
  ...patch
});

describe('confectionery template', () => {
  it('is registered in the shared lazy template registry', async () => {
    expect(registeredTemplates).toContain('confectionery@1');
    const module = await loadTemplate('confectionery', 1);
    expect(module.metadata.key).toBe('confectionery');
    expect(module.metadata.name).toBe('Кондитерская');
  });

  it('is the third business template without displacing restaurant or coffee shop', () => {
    expect(platformFallbackTemplates.map((template) => template.businessType)).toEqual([
      'restaurant',
      'coffee_shop',
      'confectionery'
    ]);
    expect(platformFallbackTemplates[2]).toMatchObject({
      templateKey: 'confectionery',
      description: 'Торты, десерты, выпечка и подарочные наборы'
    });
  });

  it('registers the demo identity, ten categories and the complete varied assortment', () => {
    expect(confectioneryTemplate.id).toBe('confectionery');
    expect(confectioneryTemplate.name).toBe('Кондитерская');
    expect(confectioneryTemplate.restaurant.name).toBe('Dolce House');
    expect(confectioneryCategories.map((category) => category.name)).toEqual([
      'Популярное',
      'Торты',
      'Торты на заказ',
      'Пироги',
      'Порционные десерты',
      'Капкейки и эклеры',
      'Фрукты в шоколаде',
      'Выпечка и печенье',
      'Подарочные наборы',
      'Напитки'
    ]);
    expect(confectioneryProducts.length).toBeGreaterThanOrEqual(30);
    expect(new Set(confectioneryProducts.map((item) => item.price_tier))).toEqual(
      new Set(['budget', 'standard', 'premium'])
    );
    expect(confectioneryProducts.filter((item) => !item.image_url).length).toBeGreaterThanOrEqual(6);
    expect(new Set(confectioneryProducts.map((item) => item.pricing_type))).toEqual(
      new Set(['fixed', 'from', 'per_kg', 'variant'])
    );
  });

  it('uses optimized local WebP files for every product that declares a photo', () => {
    const photographed = confectioneryProducts.filter((item) => item.image_url);
    expect(photographed).toHaveLength(35);
    expect(photographed.find((item) => item.id === 'birthday-custom-cake')?.image_url).toBeTruthy();

    photographed.forEach((item) => {
      expect(item.image_url.startsWith('/catalogg/assets/templates/confectionery/')).toBe(true);
      const file = join(process.cwd(), 'public', item.image_url.replace('/catalogg/', ''));
      expect(existsSync(file), `${item.title}: ${file}`).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(statSync(file).size, `${item.title} is larger than 250 KB`).toBeLessThanOrEqual(250_000);
    });

    const hero = join(process.cwd(), 'public/assets/templates/confectionery/hero.webp');
    const preview = join(process.cwd(), 'public/assets/templates/confectionery/preview.webp');
    expect(statSync(hero).size).toBeLessThanOrEqual(350_000);
    expect(statSync(preview).size).toBeLessThanOrEqual(250_000);
  });

  it('formats every supported public price without embedding strings in product data', () => {
    expect(formatCatalogProductPrice(product({ price: 220 }))).toBe('220 ₽');
    expect(formatCatalogProductPrice(product({ pricing_type: 'from', price: 950 }))).toBe('от 950 ₽');
    expect(formatCatalogProductPrice(product({ pricing_type: 'per_kg', price: 1900, unit: 'кг' }))).toBe('1 900 ₽/кг');
    expect(formatCatalogProductPrice(product({ pricing_type: 'per_kg', price: 2800, unit: 'кг', price_prefix: 'от' }))).toBe('от 2 800 ₽/кг');
    expect(formatCatalogProductPrice(product({
      pricing_type: 'variant',
      choice_options: [{ name: '4 штуки', price: 760 }, { name: '6 штук', price: 1080 }]
    }))).toBe('от 760 ₽');
  });

  it('calculates fixed, weight and variant configurations through one pricing function', () => {
    const fixed: CartItem = { product: product({ price: 180 }), quantity: 2 };
    const weighted: CartItem = {
      product: product({ pricing_type: 'per_kg', minimum_weight: 1.5, weight_step: 0.5 }),
      quantity: 1,
      selected_weight: 2.5
    };
    const variant: CartItem = {
      product: product({
        pricing_type: 'variant',
        choice_options: [{ name: '4 штуки', price: 760 }, { name: '9 штук', price: 1530 }]
      }),
      quantity: 2,
      selected_choice: '9 штук'
    };

    expect(getCartItemPrice(fixed)).toBe(180);
    expect(getCartItemTotal(fixed)).toBe(360);
    expect(getCartItemPrice(weighted)).toBe(4750);
    expect(getCartItemTotal(weighted)).toBe(4750);
    expect(getCartItemPrice(variant)).toBe(1530);
    expect(getCartItemTotal(variant)).toBe(3060);
  });

  it('keeps legacy variants, invalid price entries and non-variant products safe', () => {
    expect(getProductStartingPrice(product({
      pricing_type: 'fixed',
      price: 500,
      choice_options: [{ name: 'Не применяется', price: 100 }]
    }))).toBe(500);
    expect(getProductStartingPrice(product({
      pricing_type: 'variant',
      price: 950,
      choice_options: ['Базовый', { name: 'Нулевой', price: 0 }, { name: 'Большой', price: 1200 }]
    }))).toBe(950);
    expect(getProductStartingPrice(product({
      pricing_type: 'variant',
      price: 700,
      choice_options: [{ name: 'Недоступный', price: 0 }]
    }))).toBe(700);
    expect(formatCatalogProductPrice(product({ pricing_type: 'per_kg', price: 1900, unit: undefined }))).toBe('1 900 ₽/кг');
  });

  it('trims variant names, validates weight steps and adds only selected modifier prices', () => {
    const configured = product({
      pricing_type: 'variant',
      price: 760,
      choice_options: [{ name: ' 9 штук ', price: 1530 }],
      modifier_groups: [{
        id: 'decor',
        name: 'Декор',
        required: false,
        minSelected: 0,
        maxSelected: 1,
        options: [
          { id: 'berries', name: 'Ягоды', priceDelta: 350, isDefault: false, isActive: true },
          { id: 'free', name: 'Без декора', priceDelta: 0, isDefault: true, isActive: true }
        ]
      }]
    });
    const item: CartItem = {
      product: configured,
      quantity: 0,
      selected_choice: '9 штук',
      selected_modifiers: [{ groupId: 'decor', optionId: 'berries' }]
    };

    expect(getCartItemPrice(item)).toBe(1880);
    expect(getCartItemTotal(item)).toBe(1880);
    expect(getCartItemPrice({ ...item, selected_modifiers: [] })).toBe(1530);
    expect(getCartItemPrice({
      ...item,
      product: { ...configured, choice_options: [{ name: '9 штук', price: 1530 }] },
      selected_choice: ' 9 штук '
    })).toBe(1880);
    expect(getCartItemPrice({ ...item, selected_choice: 'Несуществующий вариант' })).toBe(1110);
    expect(normalizeSelectedWeight(product({ minimum_weight: 1.5, weight_step: 0.5 }), 2.26)).toBe(2.5);
    expect(normalizeSelectedWeight(product({ minimum_weight: 1.5, weight_step: 0.5 }), 0.5)).toBe(1.5);
    expect(normalizeSelectedWeight(product({ minimum_weight: 1, weight_step: 2 }), 1.6)).toBe(1);
    expect(getCartItemTotal({ ...item, quantity: 3 })).toBe(5640);
  });

  it('keeps two cake configurations as separate cart lines', () => {
    const first = buildCartLineId('cake-1', undefined, [], {
      selectedWeight: 2,
      inscription: 'Амина',
      productionDate: '2026-08-10',
      productionTime: '18:00'
    });
    const second = buildCartLineId('cake-1', undefined, [], {
      selectedWeight: 2.5,
      inscription: 'Амина',
      productionDate: '2026-08-10',
      productionTime: '18:00'
    });

    expect(first).not.toBe(second);
    expect(first).toBe(buildCartLineId('cake-1', undefined, [], {
      inscription: 'Амина',
      productionTime: '18:00',
      selectedWeight: 2,
      productionDate: '2026-08-10'
    }));
  });

  it('requires a filling and decoration before a custom cake can be added', () => {
    const customCake = confectioneryProducts.find((item) => item.id === 'birthday-custom-cake');
    expect(customCake).toBeDefined();
    expect(getMissingRequiredModifierGroup(customCake?.modifier_groups, [])?.name).toBe('Начинка');
    const defaults = customCake?.modifier_groups?.map((group) => ({
      groupId: group.id,
      optionId: group.options.find((option) => option.isDefault)?.id ?? ''
    })) ?? [];
    expect(getMissingRequiredModifierGroup(customCake?.modifier_groups, defaults)).toBeUndefined();
  });

  it('serializes only populated confectionery selections for the authoritative order', () => {
    const item: CartItem = {
      product: product({ pricing_type: 'per_kg', minimum_weight: 1.5, weight_step: 0.5 }),
      quantity: 1,
      selected_weight: 2,
      inscription: 'С днём рождения, Амина',
      production_date: '2026-08-10',
      production_time: '18:00',
      decoration_comment: ''
    };

    expect(buildPublicRestaurantOrderItems([item])).toEqual([{
      product_id: 'cake-1',
      quantity: 1,
      options: [
        { key: 'weight', name: 'Вес: 2 кг', value: '2', product_id: 'cake-1' },
        { key: 'inscription', name: 'Надпись: С днём рождения, Амина', value: 'С днём рождения, Амина', product_id: 'cake-1' },
        { key: 'production_date', name: 'Дата: 2026-08-10', value: '2026-08-10', product_id: 'cake-1' },
        { key: 'production_time', name: 'Время: 18:00', value: '18:00', product_id: 'cake-1' }
      ]
    }]);
  });

  it('builds a readable WhatsApp order without empty configuration values', () => {
    const text = buildWhatsappOrderText({
      businessName: 'Dolce House',
      businessLabel: 'Кондитерская',
      items: [{
        product: product({ title: 'Красный бархат', pricing_type: 'per_kg', minimum_weight: 1.5, weight_step: 0.5 }),
        quantity: 1,
        selected_weight: 2,
        inscription: 'С днём рождения, Амина',
        production_date: '2026-08-10',
        production_time: '18:00'
      }],
      fulfillmentLabel: 'Самовывоз',
      customerName: 'Амина',
      customerPhone: '+7 999 000-00-00',
      comment: '',
      total: 3800
    });

    expect(text).toContain('Новый заказ из WayYaam');
    expect(text).toContain('Кондитерская: Dolce House');
    expect(text).toContain('Вес: 2 кг');
    expect(text).toContain('Надпись: «С днём рождения, Амина»');
    expect(text).toContain('Итого: 3 800 ₽');
    expect(text).not.toMatch(/undefined|null|Вариант:\s*$/m);
  });
});
