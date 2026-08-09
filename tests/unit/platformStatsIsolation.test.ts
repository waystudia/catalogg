import { describe, expect, it } from 'vitest';
import { summarizePlatformStats, type PlatformOrderStatsRow } from '../../src/shared/api/platformStats';
import type { PlatformClient } from '../../src/shared/api/platformTypes';

const client = (overrides: Partial<PlatformClient> = {}): PlatformClient => ({
  id: 'client-real',
  companyName: 'Real Restaurant',
  ownerName: 'Owner',
  email: 'owner@example.com',
  phone: '+70000000000',
  primaryCity: 'Грозный',
  serviceSettlements: [],
  status: 'active',
  planCode: 'business',
  subscriptionStatus: 'active',
  subscriptionEndsAt: null,
  catalogId: 'catalog-real',
  catalogName: 'Real Restaurant',
  catalogSlug: 'real',
  catalogStatus: 'published',
  templateName: 'Restaurant',
  templateKey: 'restaurant-modern',
  templateVersion: 1,
  businessType: 'restaurant',
  logoUrl: '',
  debtAmount: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...overrides
});

const order = (overrides: Partial<PlatformOrderStatsRow> = {}): PlatformOrderStatsRow => ({
  catalog_id: 'catalog-real',
  total_amount: 760,
  delivery_provider: 'platform',
  status: 'completed',
  is_test_order: false,
  ...overrides
});

describe('platform statistics test-data isolation', () => {
  it('excludes a completed test order from every production KPI', () => {
    const stats = summarizePlatformStats([client()], [
      order(),
      order({ total_amount: 9999, is_test_order: true })
    ]);

    expect(stats).toMatchObject({
      monthlyRevenue: 760,
      totalOrders: 1,
      driverDeliveries: 1
    });
    expect(stats.restaurantStats).toEqual([
      expect.objectContaining({ revenue: 760, ordersCount: 1, driverDeliveries: 1 })
    ]);
  });

  it('still counts a non-test order when the marker is absent for legacy rows', () => {
    const stats = summarizePlatformStats([client()], [order({ is_test_order: undefined })]);

    expect(stats.totalOrders).toBe(1);
    expect(stats.monthlyRevenue).toBe(760);
  });

  it('keeps persisted restaurant debt independent from order revenue', () => {
    const stats = summarizePlatformStats(
      [client({ debtAmount: 30 })],
      [order({ total_amount: 10_000 })]
    );

    expect(stats.monthlyRevenue).toBe(10_000);
    expect(stats.totalDebt).toBe(30);
    expect(stats.restaurantStats[0]?.debt).toBe(30);
  });

  it('excludes the permanent test restaurant from production client and catalog totals', () => {
    const stats = summarizePlatformStats([
      client(),
      client({
        id: 'client-test',
        catalogId: 'catalog-test',
        catalogName: 'WayYaam Test Restaurant',
        catalogSlug: 'wayyaam-test-restaurant',
        isTest: true
      })
    ], []);

    expect(stats.totalClients).toBe(1);
    expect(stats.activeCatalogs).toBe(1);
    expect(stats.restaurantStats).toHaveLength(1);
    expect(stats.restaurantStats[0]?.id).toBe('catalog-real');
  });
});
