import type { PlatformBusinessStats, PlatformClient, PlatformStats } from './platformTypes';

export type PlatformOrderStatsRow = {
  catalog_id?: string | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  restaurant_slug?: string | null;
  total?: number | null;
  total_amount?: number | null;
  delivery_provider?: string | null;
  status?: string | null;
  is_test_order?: boolean | null;
};

const canceledStatuses = new Set(['canceled', 'cancelled']);

const getOrderBusinessId = (order: PlatformOrderStatsRow) =>
  order.catalog_id || order.restaurant_id || 'unknown-restaurant';

const getOrderAmount = (order: PlatformOrderStatsRow) => {
  const totalAmount = Number(order.total_amount ?? 0);
  return totalAmount > 0 ? totalAmount : Number(order.total ?? 0);
};

export const summarizePlatformStats = (
  clients: PlatformClient[],
  orders: PlatformOrderStatsRow[]
): PlatformStats => {
  const productionClients = clients.filter((client) => client.isTest !== true);
  const productionOrders = orders.filter((order) => order.is_test_order !== true);
  const businessStatsById = new Map<string, PlatformBusinessStats>(
    productionClients.map((client) => [
      client.catalogId || client.id,
      {
        id: client.catalogId || client.id,
        clientId: client.id,
        name: client.catalogName || client.companyName,
        slug: client.catalogSlug,
        businessType: client.businessType,
        revenue: 0,
        debt: client.debtAmount,
        testDebt: client.testDebtAmount ?? 0,
        ordersCount: 0,
        driverDeliveries: 0
      }
    ])
  );

  productionOrders.forEach((order) => {
    const businessId = getOrderBusinessId(order);
    const current =
      businessStatsById.get(businessId) ??
      {
        id: businessId,
        clientId: '',
        name: order.restaurant_name || 'Бизнес',
        slug: order.restaurant_slug || '',
        businessType: 'restaurant',
        revenue: 0,
        debt: 0,
        ordersCount: 0,
        driverDeliveries: 0
      };
    const isCanceled = canceledStatuses.has(order.status ?? '');

    current.ordersCount += 1;
    if (!isCanceled) {
      const orderAmount = getOrderAmount(order);
      current.revenue += orderAmount;
    }
    if (order.delivery_provider === 'platform') {
      current.driverDeliveries += 1;
    }

    businessStatsById.set(businessId, current);
  });

  const completedOrders = productionOrders.filter((order) => !canceledStatuses.has(order.status ?? ''));
  const businessStats = Array.from(businessStatsById.values());

  return {
    totalClients: productionClients.length,
    activeCatalogs: productionClients.filter((client) => client.catalogStatus === 'published').length,
    daysActive: productionClients.length > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - Math.min(...productionClients.map((client) => Date.parse(client.createdAt)).filter(Number.isFinite))) /
              86_400_000
          )
        )
      : 0,
    monthlyRevenue: completedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0),
    monthlyViews: 0,
    totalDebt: businessStats.reduce((sum, business) => sum + business.debt, 0),
    totalOrders: productionOrders.length,
    driverDeliveries: productionOrders.filter((order) => order.delivery_provider === 'platform').length,
    businessStats,
    restaurantStats: businessStats
  };
};
