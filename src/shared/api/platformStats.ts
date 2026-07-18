import type { PlatformClient, PlatformStats } from './platformTypes';

export type PlatformOrderStatsRow = {
  catalog_id?: string | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  restaurant_slug?: string | null;
  total?: number | null;
  total_amount?: number | null;
  delivery_provider?: string | null;
  status?: string | null;
};

const canceledStatuses = new Set(['canceled', 'cancelled']);
const defaultRestaurantCommissionRate = 0.07;

const getOrderRestaurantId = (order: PlatformOrderStatsRow) =>
  order.catalog_id || order.restaurant_id || 'unknown-restaurant';

const getOrderAmount = (order: PlatformOrderStatsRow) => Number(order.total_amount ?? order.total ?? 0);

export const summarizePlatformStats = (
  clients: PlatformClient[],
  orders: PlatformOrderStatsRow[]
): PlatformStats => {
  const restaurantStatsById = new Map(
    clients.map((client) => [
      client.catalogId || client.id,
      {
        id: client.catalogId || client.id,
        clientId: client.id,
        name: client.catalogName || client.companyName,
        slug: client.catalogSlug,
        revenue: 0,
        debt: 0,
        ordersCount: 0,
        driverDeliveries: 0
      }
    ])
  );

  orders.forEach((order) => {
    const restaurantId = getOrderRestaurantId(order);
    const current =
      restaurantStatsById.get(restaurantId) ??
      {
        id: restaurantId,
        clientId: '',
        name: order.restaurant_name || 'Ресторан',
        slug: order.restaurant_slug || '',
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
      current.debt += Math.round(orderAmount * defaultRestaurantCommissionRate);
    }
    if (order.delivery_provider === 'platform') {
      current.driverDeliveries += 1;
    }

    restaurantStatsById.set(restaurantId, current);
  });

  const completedOrders = orders.filter((order) => !canceledStatuses.has(order.status ?? ''));
  const restaurantStats = Array.from(restaurantStatsById.values());

  return {
    totalClients: clients.length,
    activeCatalogs: clients.filter((client) => client.catalogStatus === 'published').length,
    monthlyRevenue: completedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0),
    monthlyViews: 0,
    totalDebt: restaurantStats.reduce((sum, restaurant) => sum + restaurant.debt, 0),
    totalOrders: orders.length,
    driverDeliveries: orders.filter((order) => order.delivery_provider === 'platform').length,
    restaurantStats
  };
};
