import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CartItem, Product } from '../../entities/models';
import {
  createRestaurantOrderWithClient,
  buildOrderStatusShareUrl,
  buildPublicRestaurantOrderItems,
  normalizeRestaurantDeliverySettingsForSave,
  resolvePublicOrderRpcName,
  type CreateRestaurantOrderFromCartInput,
  type PublicRestaurantOrderClient
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

  it('sends an idempotency key with public restaurant order RPC calls', async () => {
    let rpcArgs: Record<string, unknown> = {};
    const client: PublicRestaurantOrderClient = {
      async rpc(_name, args) {
        rpcArgs = args;
        return { data: 'order-123', error: null };
      },
      from() {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }
    };

    await createRestaurantOrderWithClient(
      client,
      'catalog-1',
      orderInput({ idempotencyKey: 'checkout-attempt-1' })
    );

    assert.equal(rpcArgs.idempotency_key, 'checkout-attempt-1');
  });

  it('keeps the selected dish variant in the restaurant-visible order comment', async () => {
    let rpcArgs: Record<string, unknown> = {};
    const client: PublicRestaurantOrderClient = {
      async rpc(_name, args) {
        rpcArgs = args;
        return { data: 'order-choice', error: null };
      },
      from() {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }
    };

    await createRestaurantOrderWithClient(client, 'catalog-1', {
      ...orderInput(),
      items: [{ product: product(), quantity: 1, selected_choice: 'Острый' }]
    });

    assert.match(String(rpcArgs.comment), /Жижиг-галнаш: Острый/);
  });

  it('retries without idempotency key when the deployed SQL overload is ambiguous', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: PublicRestaurantOrderClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (args.idempotency_key) {
          return {
            data: null,
            error: {
              code: '42702',
              message: 'column reference "idempotency_key" is ambiguous'
            }
          };
        }
        return { data: 'order-retried', error: null };
      },
      from() {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }
    };

    const orderId = await createRestaurantOrderWithClient(
      client,
      'catalog-1',
      orderInput({ idempotencyKey: 'checkout-attempt-1' })
    );

    assert.equal(orderId, 'order-retried');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args.idempotency_key, 'checkout-attempt-1');
    assert.equal('idempotency_key' in calls[1].args, false);
  });

  it('keeps the order created when only the post-create location update is rejected', async () => {
    const calls: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const client: PublicRestaurantOrderClient = {
      async rpc() {
        return { data: 'order-123', error: null };
      },
      from(table) {
        return {
          update(patch) {
            calls.push({ table, patch });
            return {
              async eq(column, value) {
                assert.equal(column, 'id');
                assert.equal(value, 'order-123');
                return { error: new Error('new row violates row-level security policy') };
              }
            };
          }
        };
      }
    };

    const orderId = await createRestaurantOrderWithClient(client, 'catalog-1', orderInput());

    assert.equal(orderId, 'order-123');
    assert.deepEqual(calls, [
      {
        table: 'orders',
        patch: {
          delivery_lat: 43.3181235,
          delivery_lng: 45.6987654,
          client_lat: 43.3181235,
          client_lng: 45.6987654,
          client_accuracy_m: 18,
          delivery_address_snapshot: 'Грозный, Центр, ул. Мира, 1'
        }
      }
    ]);
  });

  it('does not treat a failed public order RPC as a created order', async () => {
    const client: PublicRestaurantOrderClient = {
      async rpc() {
        return { data: null, error: new Error('RPC failed') };
      },
      from() {
        throw new Error('coordinates should not be updated when the order was not created');
      }
    };

    await assert.rejects(
      () => createRestaurantOrderWithClient(client, 'catalog-1', orderInput()),
      /RPC failed/
    );
  });

  it('includes client coordinates in the order comment before the best-effort update', async () => {
    let rpcArgs: Record<string, unknown> = {};
    const client: PublicRestaurantOrderClient = {
      async rpc(_name, args) {
        rpcArgs = args;
        return { data: 'order-123', error: null };
      },
      from() {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }
    };

    await createRestaurantOrderWithClient(client, 'catalog-1', orderInput({ comment: 'Позвонить заранее' }));

    assert.equal(
      rpcArgs.comment,
      'Позвонить заранее\nКоординаты клиента: 43.3181235, 45.6987654 (точность 18 м)'
    );
  });

  it('falls back to the legacy public order RPC when the restaurant RPC is missing in Supabase', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: PublicRestaurantOrderClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'create_public_restaurant_order') {
          return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
        }
        return { data: 'order-fallback', error: null };
      },
      from() {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }
    };

    const orderId = await createRestaurantOrderWithClient(client, 'catalog-1', orderInput());

    assert.equal(orderId, 'order-fallback');
    assert.deepEqual(
      calls.map((call) => call.name),
      ['create_public_restaurant_order', 'create_public_order']
    );
    assert.equal(calls[1].args.table_label, '');
    assert.equal(calls[1].args.comment, 'Координаты клиента: 43.3181235, 45.6987654 (точность 18 м)');
  });

  it('builds a WhatsApp-safe link to the already-created order status page', () => {
    assert.equal(
      buildOrderStatusShareUrl({
        origin: 'https://studia95.github.io',
        basePath: '/catalogg/',
        restaurantSlug: 'mangal',
        orderId: '83ec0369'
      }),
      'https://studia95.github.io/catalogg/#/mangal/order/83ec0369'
    );
  });
});

const orderInput = (
  overrides: Partial<CreateRestaurantOrderFromCartInput> = {}
): CreateRestaurantOrderFromCartInput => ({
  slug: 'mangal',
  items: [{ product: product({ id: '11111111-1111-4111-8111-111111111111' }), quantity: 2 }],
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryCity: 'Грозный',
  deliverySettlement: 'Центр',
  deliveryAddress: 'Грозный, Центр, ул. Мира, 1',
  deliveryLat: 43.3181235,
  deliveryLng: 45.6987654,
  deliveryAccuracyM: 18,
  comment: '',
  customerName: 'Адам',
  customerPhone: '+79990000000',
  ...overrides
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
