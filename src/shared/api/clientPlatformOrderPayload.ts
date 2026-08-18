import type { ClientCartLine, ClientDish } from '../../features/client-platform/types';
import type { BusinessType } from '../businessTerminology';

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
) => {
  void items;
  void businessType;
  return 'create_secure_client_platform_order';
};
