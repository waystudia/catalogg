import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartItem, Product } from '../../src/entities/models';
import {
  createRestaurantOrderWithClient,
  type PublicRestaurantOrderClient
} from '../../src/shared/api/restaurantOrderPayload';

const item: CartItem = {
  product: {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Комбо шаурма',
    price: 400,
    is_unlimited: true
  } as Product,
  quantity: 1
};

const input = {
  slug: 'mangal',
  items: [item],
  fulfillmentType: 'hall' as const,
  customerName: 'Гость',
  customerPhone: '+70000000000',
  idempotencyKey: 'mobile-order-attempt'
};

const clientWithRpc = (rpc: PublicRestaurantOrderClient['rpc']): PublicRestaurantOrderClient => ({
  rpc,
  from() {
    throw new Error('orders must be finalized by the secure RPC');
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile order retry', () => {
  it('reuses the exact idempotency key after a lost Safari response', async () => {
    vi.useFakeTimers();
    const calls: Record<string, unknown>[] = [];
    const client = clientWithRpc(async (_name, args) => {
      calls.push(args);
      if (calls.length === 1) throw new TypeError('Load failed');
      return { data: { order_id: 'order-after-reconnect' }, error: null };
    });

    const result = createRestaurantOrderWithClient(client, 'catalog-id', input);
    await vi.advanceTimersByTimeAsync(350);

    await expect(result).resolves.toBe('order-after-reconnect');
    expect(calls).toHaveLength(2);
    expect(calls[0].idempotency_key).toBe('mobile-order-attempt');
    expect(calls[1].idempotency_key).toBe('mobile-order-attempt');
  });

  it('stops after three transient failures instead of looping forever', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = clientWithRpc(async () => {
      calls += 1;
      throw new TypeError('Load failed');
    });

    const result = createRestaurantOrderWithClient(client, 'catalog-id', input);
    const rejection = expect(result).rejects.toThrow('Load failed');
    await vi.advanceTimersByTimeAsync(1_250);

    await rejection;
    expect(calls).toBe(3);
  });

  it('does not repeat a non-network database rejection', async () => {
    let calls = 0;
    const client = clientWithRpc(async () => {
      calls += 1;
      return { data: null, error: new Error('legal_document_version_invalid') };
    });

    await expect(createRestaurantOrderWithClient(client, 'catalog-id', input))
      .rejects.toThrow('legal_document_version_invalid');
    expect(calls).toBe(1);
  });
});
