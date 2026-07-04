import type { CartItem } from '../../entities/models';

type DeliverySettingsForSave = {
  service_settlements: string[];
  delivery_hours_start: string | null | undefined;
  delivery_hours_end: string | null | undefined;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const buildPublicRestaurantOrderItems = (items: CartItem[]) =>
  items.map((item) => ({
    product_id: item.product.id,
    quantity: Math.max(1, item.quantity),
    options: []
  }));

export const resolvePublicOrderRpcName = (items: CartItem[]) =>
  items.every((item) => uuidPattern.test(item.product.id))
    ? 'create_public_restaurant_order'
    : 'create_legacy_public_restaurant_order';

export const normalizeRestaurantDeliverySettingsForSave = <T extends DeliverySettingsForSave>(settings: T) => ({
  ...settings,
  service_settlements: (settings.service_settlements ?? []).map((item) => item.trim()).filter(Boolean),
  delivery_hours_start: settings.delivery_hours_start?.trim() || null,
  delivery_hours_end: settings.delivery_hours_end?.trim() || null
});
