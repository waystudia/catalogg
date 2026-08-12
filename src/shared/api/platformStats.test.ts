import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizePlatformStats } from './platformStats';
import type { PlatformClient } from './platformTypes';

const clients: PlatformClient[] = [
  {
    id: 'client-rizih',
    companyName: 'Rizih LLC',
    ownerName: 'Адам',
    email: 'rizih@example.com',
    phone: '+7',
    primaryCity: 'Грозный',
    serviceSettlements: [],
    status: 'active',
    planCode: 'business',
    subscriptionStatus: 'active',
    subscriptionEndsAt: null,
    catalogId: 'catalog-rizih',
    catalogName: 'Rizih',
    catalogSlug: 'rizih',
    catalogStatus: 'published',
    templateName: 'Restaurant',
    templateKey: 'restaurant-modern',
    templateVersion: 1,
    businessType: 'restaurant',
    logoUrl: '',
    debtAmount: 240,
    createdAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'client-mangal',
    companyName: 'Mangal LLC',
    ownerName: 'Муса',
    email: 'mangal@example.com',
    phone: '+7',
    primaryCity: 'Грозный',
    serviceSettlements: [],
    status: 'active',
    planCode: 'business',
    subscriptionStatus: 'past_due',
    subscriptionEndsAt: null,
    catalogId: 'catalog-mangal',
    catalogName: 'Мангал',
    catalogSlug: 'mangal',
    catalogStatus: 'published',
    templateName: 'Restaurant',
    templateKey: 'restaurant-modern',
    templateVersion: 1,
    businessType: 'restaurant',
    logoUrl: '',
    debtAmount: 30,
    createdAt: '2026-07-02T00:00:00.000Z'
  }
];

describe('platform revenue stats', () => {
  it('aggregates global and per-restaurant order numbers without counting canceled revenue', () => {
    const stats = summarizePlatformStats(clients, [
      {
        catalog_id: 'catalog-rizih',
        total_amount: 1200,
        delivery_provider: 'platform',
        status: 'completed'
      },
      {
        catalog_id: 'catalog-rizih',
        total: 900,
        delivery_provider: 'restaurant',
        status: 'canceled'
      },
      {
        catalog_id: 'catalog-mangal',
        total: 700,
        total_amount: 0,
        delivery_provider: 'restaurant',
        status: 'accepted'
      }
    ]);

    assert.equal(stats.totalClients, 2);
    assert.equal(stats.activeCatalogs, 2);
    assert.equal(stats.monthlyRevenue, 1900);
    assert.equal(stats.totalDebt, 270);
    assert.equal(stats.totalOrders, 3);
    assert.equal(stats.driverDeliveries, 1);
    assert.deepEqual(
      stats.restaurantStats.map((restaurant) => ({
        slug: restaurant.slug,
        revenue: restaurant.revenue,
        debt: restaurant.debt,
        ordersCount: restaurant.ordersCount,
        driverDeliveries: restaurant.driverDeliveries
      })),
      [
        { slug: 'rizih', revenue: 1200, debt: 240, ordersCount: 2, driverDeliveries: 1 },
        { slug: 'mangal', revenue: 700, debt: 30, ordersCount: 1, driverDeliveries: 0 }
      ]
    );
  });

  it('shows the persisted ledger debt without recalculating it from order revenue', () => {
    const stats = summarizePlatformStats(
      [{ ...clients[0], debtAmount: 30 }],
      [{ catalog_id: 'catalog-rizih', total_amount: 10_000, status: 'completed' }]
    );

    assert.equal(stats.monthlyRevenue, 10_000);
    assert.equal(stats.totalDebt, 30);
    assert.equal(stats.restaurantStats[0]?.debt, 30);
  });

  it('includes grocery revenue in the same global and per-business ledger', () => {
    const groceryClient = {
      ...clients[0],
      id: 'client-finiki',
      companyName: 'Финики',
      catalogId: 'catalog-finiki',
      catalogName: 'Финики',
      catalogSlug: 'finiki',
      businessType: 'grocery' as const,
      debtAmount: 45
    };
    const stats = summarizePlatformStats([...clients, groceryClient], [
      { catalog_id: 'catalog-finiki', total_amount: 2450, status: 'completed', delivery_provider: 'platform' }
    ]);

    assert.equal(stats.monthlyRevenue, 2450);
    assert.equal(stats.totalDebt, 315);
    assert.deepEqual(
      stats.businessStats?.find((business) => business.id === 'catalog-finiki'),
      {
        id: 'catalog-finiki',
        clientId: 'client-finiki',
        name: 'Финики',
        slug: 'finiki',
        businessType: 'grocery',
        revenue: 2450,
        debt: 45,
        testDebt: 0,
        ordersCount: 1,
        driverDeliveries: 1
      }
    );
    assert.equal(stats.restaurantStats, stats.businessStats);
  });
});
