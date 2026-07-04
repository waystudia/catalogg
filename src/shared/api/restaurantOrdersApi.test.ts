import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CartItem, Product } from '../../entities/models';
import {
  buildPublicRestaurantOrderItems,
  normalizeRestaurantDeliverySettingsForSave,
  resolvePublicOrderRpcName
} from './restaurantOrderPayload';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  title: 'Жижиг-галнаш',
  price: 380,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_unlimited: true,
  stock_count: 10,
  category_id: 'chechen',
  pair_ids: [],
  ...overrides
});

describe('public restaurant order payload', () => {
  it('serializes legacy cart lines with an explicit empty options array', () => {
    const items: CartItem[] = [{ product: product(), quantity: 2 }];

    assert.deepEqual(buildPublicRestaurantOrderItems(items), [
      {
        product_id: 'product-1',
        quantity: 2,
        options: []
      }
    ]);
  });

  it('uses the legacy public order RPC when cart products have old text ids', () => {
    const items: CartItem[] = [{ product: product({ id: 'zhizhig-galnash' }), quantity: 1 }];

    assert.equal(resolvePublicOrderRpcName(items), 'create_legacy_public_restaurant_order');
  });

  it('uses the platform public order RPC when cart products have uuid ids', () => {
    const items: CartItem[] = [
      { product: product({ id: '11111111-1111-4111-8111-111111111111' }), quantity: 1 }
    ];

    assert.equal(resolvePublicOrderRpcName(items), 'create_public_restaurant_order');
  });

  it('clamps persisted invalid quantities before sending the order to Supabase', () => {
    const items: CartItem[] = [{ product: product({ id: 'product-2' }), quantity: 0 }];

    assert.deepEqual(buildPublicRestaurantOrderItems(items), [
      {
        product_id: 'product-2',
        quantity: 1,
        options: []
      }
    ]);
  });
});

describe('restaurant delivery settings payload', () => {
  it('sends empty delivery hours as null instead of an invalid time string', () => {
    const settings = {
      enable_orders: true,
      enable_delivery: true,
      enable_pickup: true,
      enable_hall_orders: true,
      use_own_courier: false,
      use_platform_drivers: true,
      own_courier_wait_minutes: 5,
      fallback_to_platform_drivers: true,
      qr_required: false,
      minimum_order_amount: 0,
      free_delivery_from: 0,
      default_preparation_minutes: 25,
      delivery_radius_km: 5,
      delivery_area_mode: 'radius',
      primary_city: '',
      service_settlements: ['Черноречье', ''],
      delivery_hours_start: '',
      delivery_hours_end: '',
      out_of_hours_mode: 'warn'
    };

    assert.deepEqual(normalizeRestaurantDeliverySettingsForSave(settings), {
      ...settings,
      service_settlements: ['Черноречье'],
      delivery_hours_start: null,
      delivery_hours_end: null
    });
  });

  it('keeps nullable delivery hours safe when loaded settings are saved unchanged', () => {
    const settings = {
      enable_orders: true,
      enable_delivery: true,
      enable_pickup: true,
      enable_hall_orders: true,
      use_own_courier: false,
      use_platform_drivers: true,
      own_courier_wait_minutes: 5,
      fallback_to_platform_drivers: true,
      qr_required: false,
      minimum_order_amount: 0,
      free_delivery_from: 0,
      default_preparation_minutes: 25,
      delivery_radius_km: 5,
      delivery_area_mode: 'radius',
      primary_city: '',
      service_settlements: ['Черноречье'],
      delivery_hours_start: null,
      delivery_hours_end: null,
      out_of_hours_mode: 'warn'
    };

    assert.deepEqual(normalizeRestaurantDeliverySettingsForSave(settings), {
      ...settings,
      service_settlements: ['Черноречье'],
      delivery_hours_start: null,
      delivery_hours_end: null
    });
  });
});
