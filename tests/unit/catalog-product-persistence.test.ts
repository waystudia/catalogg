import { describe, expect, it } from 'vitest';
import { resolvePlatformProductWrite } from '../../src/shared/catalogProductPersistence';

describe('catalog product persistence target', () => {
  it('updates a row already holding the slug even when the local product id is a different UUID', () => {
    expect(resolvePlatformProductWrite(
      '2030a738-0c9d-44d8-b6a2-ae7198386168',
      'be7f739a-3e77-4885-90cf-1697d976ef5e'
    )).toEqual({ kind: 'update', productId: 'be7f739a-3e77-4885-90cf-1697d976ef5e' });
  });

  it('upserts a UUID when the slug is free and inserts generated legacy ids', () => {
    expect(resolvePlatformProductWrite('2030a738-0c9d-44d8-b6a2-ae7198386168', null)).toEqual({
      kind: 'upsert',
      productId: '2030a738-0c9d-44d8-b6a2-ae7198386168'
    });
    expect(resolvePlatformProductWrite('dish-large-spicy', null)).toEqual({ kind: 'insert' });
  });
});
