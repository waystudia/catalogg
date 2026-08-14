import { describe, expect, it } from 'vitest';
import { getBusinessOrderCapabilities } from '../../src/entities/businessOrderCapabilities';

describe('business order capabilities', () => {
  it('keeps restaurant preparation, hall, pickup and delivery in the compact workflow', () => {
    expect(getBusinessOrderCapabilities('restaurant')).toMatchObject({
      workflow: 'preparation',
      supportsHall: true,
      supportsPickup: true,
      supportsDelivery: true,
      supportsPicking: false,
      startWorkLabel: 'Начать готовить',
      readyLabel: 'Заказ готов'
    });
  });

  it('uses pickup, delivery and picking for grocery without restaurant hall controls', () => {
    expect(getBusinessOrderCapabilities('grocery')).toMatchObject({
      workflow: 'picking',
      supportsHall: false,
      supportsPickup: true,
      supportsDelivery: true,
      supportsPicking: true,
      customerLabel: 'Покупатель',
      startWorkLabel: 'Начать сборку',
      readyLabel: 'Заказ собран'
    });
  });

  it('gives other retail types the same extensible picking vocabulary', () => {
    expect(getBusinessOrderCapabilities('flowers')).toMatchObject({
      workflow: 'picking',
      supportsHall: false,
      merchantLabel: 'Цветочный магазин'
    });
    expect(getBusinessOrderCapabilities('pharmacy')).toMatchObject({
      workflow: 'picking',
      merchantLabel: 'Аптека'
    });
  });
});
