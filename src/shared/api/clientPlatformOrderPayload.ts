import type { ClientCartLine, ClientDish } from '../../features/client-platform/types';
import type { BusinessType } from '../businessTerminology';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClientPlatformOrderItemPayload = {
  readonly product_id: string;
  readonly quantity: number;
  readonly requested_quantity?: number;
  readonly options: readonly [];
};

export const buildClientOrderItems = (
  lines: readonly ClientCartLine[],
  dishes: readonly ClientDish[]
): ClientPlatformOrderItemPayload[] => {
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  return lines.map((line) => {
    const dish = dishById.get(line.dishId);
    const requestedQuantity = Math.max(1, Math.floor(line.quantity));
    return dish?.saleUnit === 'weight'
      ? {
          product_id: line.dishId,
          quantity: 1,
          requested_quantity: requestedQuantity,
          options: []
        }
      : {
          product_id: line.dishId,
          quantity: requestedQuantity,
          options: []
        };
  });
};

export const resolveClientOrderRpcName = (
  items: readonly ClientPlatformOrderItemPayload[],
  businessType?: BusinessType
) =>
  items.every((item) => uuidPattern.test(item.product_id))
    ? businessType === 'grocery' || items.some((item) => item.requested_quantity !== undefined)
      ? 'create_client_platform_catalog_order'
      : 'create_client_platform_restaurant_order'
    : 'create_client_platform_legacy_restaurant_order';
