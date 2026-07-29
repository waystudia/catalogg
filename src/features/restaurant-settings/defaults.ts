import type { RestaurantDeliverySettings } from '../../shared/api/restaurantOrdersApi';

export const defaultRestaurantDeliverySettings: RestaurantDeliverySettings = {
  enable_orders: false,
  enable_delivery: true,
  enable_pickup: true,
  enable_hall_orders: true,
  use_own_courier: false,
  use_platform_drivers: false,
  own_courier_wait_minutes: 5,
  fallback_to_platform_drivers: true,
  qr_required: false,
  minimum_order_amount: 0,
  free_delivery_from: 0,
  default_preparation_minutes: 25,
  delivery_radius_km: 5,
  delivery_area_mode: 'radius',
  primary_city: '',
  service_settlements: [],
  delivery_hours_start: '',
  delivery_hours_end: '',
  out_of_hours_mode: 'warn'
};
