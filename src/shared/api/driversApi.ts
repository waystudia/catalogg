import { supabase } from '../supabase';
import { normalizeDriverCapacity } from '../driverCapacity';
import type {
  CreateDriverPayload,
  CreateDriverResult,
  PlatformDriver,
  PlatformDriverActivity,
  UpdateDriverPayload
} from './platformTypes';
import type { RestaurantCourierType } from '../../features/restaurant-billing/restaurantBillingRules';

type DriverRow = {
  id: string;
  user_id: string | null;
  email?: string | null;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  photo_url: string | null;
  city_name?: string | null;
  service_settlements?: string[] | null;
  is_active: boolean | null;
  is_online: boolean | null;
  is_premium?: boolean | null;
  status: string | null;
  rating: number | null;
  debt_amount?: number | string | null;
  max_active_deliveries?: number | string | null;
  created_at: string;
  users?: {
    email?: string | null;
  } | null;
  cities?: {
    name?: string | null;
  } | null;
};

const demoDrivers: PlatformDriver[] = [
  {
    id: 'driver-demo',
    userId: 'user-driver-demo',
    name: 'Алан М.',
    phone: '+7 928 123-45-67',
    email: 'driver@example.com',
    vehicleInfo: 'Hyundai Solaris',
    carNumber: 'A123BC 95',
    photoUrl: '',
    cityName: 'Грозный',
    serviceSettlements: ['Грозный'],
    isActive: true,
    isOnline: true,
    isPremium: false,
    status: 'online',
    rating: 4.9,
    debt: 0,
    maxActiveDeliveries: 1,
    createdAt: new Date().toISOString()
  }
];

const mapDriver = (row: DriverRow): PlatformDriver => ({
  id: row.id,
  userId: row.user_id ?? '',
  name: row.name ?? '',
  phone: row.phone ?? '',
  email: row.email ?? row.users?.email ?? '',
  vehicleInfo: row.vehicle_info ?? '',
  carNumber: row.car_number ?? '',
  photoUrl: row.photo_url ?? '',
  cityName: row.city_name ?? row.cities?.name ?? '',
  serviceSettlements: Array.isArray(row.service_settlements) ? row.service_settlements : [],
  isActive: row.is_active ?? true,
  isOnline: row.is_online ?? false,
  isPremium: row.is_premium ?? false,
  status: row.status ?? 'offline',
  rating: Number(row.rating ?? 5),
  debt: Number(row.debt_amount ?? 0),
  maxActiveDeliveries: normalizeDriverCapacity(row.max_active_deliveries),
  createdAt: row.created_at
});

export type DriverRestaurantAssignment = {
  restaurantId: string;
  restaurantName: string;
  isPrimary: boolean;
  priority: number;
  courierType: RestaurantCourierType | null;
};

async function getFunctionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: string };
        if (body.error) return body.error;
      } catch {
        // Fall through to the original error message.
      }
    }
  }

  return error instanceof Error ? error.message : 'Не удалось выполнить Edge Function.';
}

export async function getDrivers(): Promise<PlatformDriver[]> {
  if (!supabase) return demoDrivers;

  const result = await supabase
    .from('drivers')
    .select('id, user_id, name, phone, vehicle_info, car_number, photo_url, city_name, service_settlements, is_active, is_online, is_premium, status, rating, debt_amount, max_active_deliveries, created_at, users(email), cities(name)')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (!result.error) {
    return ((result.data ?? []) as unknown as DriverRow[]).map(mapDriver);
  }

  const fallback = await supabase
    .from('drivers')
    .select('id, user_id, email, name, phone, vehicle_info, car_number, photo_url, city_name, service_settlements, is_active, is_online, is_premium, status, rating, created_at')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as unknown as DriverRow[]).map(mapDriver);
}

export async function getPlatformDriverActivity(): Promise<PlatformDriverActivity[]> {
  if (!supabase) {
    return demoDrivers.map((driver) => ({
      driverId: driver.id,
      deliveryCount: 0,
      completedDeliveries: 0,
      earnedAmount: 0
    }));
  }

  const [deliveriesResult, earningsResult] = await Promise.all([
    supabase.from('deliveries').select('driver_id, status').eq('is_test', false).not('driver_id', 'is', null).limit(5000),
    supabase.from('earnings').select('driver_id, amount, net_amount').eq('is_test', false).limit(5000)
  ]);

  const activity = new Map<string, PlatformDriverActivity>();
  const getActivity = (driverId: string) => {
    const current = activity.get(driverId) ?? {
      driverId,
      deliveryCount: 0,
      completedDeliveries: 0,
      earnedAmount: 0
    };
    activity.set(driverId, current);
    return current;
  };

  if (!deliveriesResult.error) {
    for (const row of (deliveriesResult.data ?? []) as Array<{ driver_id: string | null; status: string | null }>) {
      if (!row.driver_id) continue;
      const current = getActivity(row.driver_id);
      current.deliveryCount += 1;
      if (row.status === 'delivered') current.completedDeliveries += 1;
    }
  }

  if (!earningsResult.error) {
    for (const row of (earningsResult.data ?? []) as Array<{
      driver_id: string | null;
      amount: number | string | null;
      net_amount: number | string | null;
    }>) {
      if (!row.driver_id) continue;
      const current = getActivity(row.driver_id);
      current.earnedAmount += Number(row.net_amount ?? row.amount ?? 0);
    }
  }

  return Array.from(activity.values());
}

export async function createDriver(payload: CreateDriverPayload): Promise<CreateDriverResult> {
  if (!supabase) {
    return {
      driverId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      email: payload.email
    };
  }

  const { data, error } = await supabase.functions.invoke<CreateDriverResult>('create-driver', {
    body: payload
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data) throw new Error('Edge Function did not return driver data.');
  return data;
}

export async function updateDriverServiceSettlements(driverId: string, serviceSettlements: string[]) {
  if (!supabase) return;

  const { error } = await supabase
    .from('drivers')
    .update({ service_settlements: serviceSettlements })
    .eq('id', driverId);

  if (error) throw error;
}

export async function updateDriverProfile(payload: UpdateDriverPayload) {
  if (!supabase) return;

  if (payload.password) {
    const { data, error } = await supabase.functions.invoke<{ driverId: string }>('update-driver', {
      body: payload
    });
    if (error) throw new Error(await getFunctionErrorMessage(error));
    if (!data) throw new Error('Edge Function did not return driver data.');
  }

  const driverPatch: Record<string, unknown> = {};
  if (payload.name !== undefined) driverPatch.name = payload.name;
  if (payload.phone !== undefined) driverPatch.phone = payload.phone;
  if (payload.cityName !== undefined) driverPatch.city_name = payload.cityName;
  if (payload.serviceSettlements !== undefined) driverPatch.service_settlements = payload.serviceSettlements;
  if (payload.vehicleInfo !== undefined) driverPatch.vehicle_info = payload.vehicleInfo;
  if (payload.carNumber !== undefined) driverPatch.car_number = payload.carNumber;
  if (payload.photoUrl !== undefined) driverPatch.photo_url = payload.photoUrl;
  if (payload.isActive !== undefined) driverPatch.is_active = payload.isActive;
  if (payload.maxActiveDeliveries !== undefined) {
    driverPatch.max_active_deliveries = normalizeDriverCapacity(payload.maxActiveDeliveries);
  }

  if (Object.keys(driverPatch).length > 0) {
    const { error } = await supabase
      .from('drivers')
      .update(driverPatch)
      .eq('id', payload.driverId);
    if (error) throw error;
  }

  if (payload.userId && (payload.name !== undefined || payload.phone !== undefined)) {
    const userPatch: Record<string, unknown> = {};
    if (payload.name !== undefined) userPatch.name = payload.name;
    if (payload.phone !== undefined) userPatch.phone = payload.phone;

    const { error } = await supabase
      .from('users')
      .update(userPatch)
      .eq('id', payload.userId);
    if (error) throw error;
  }

  if (payload.isPremium !== undefined) {
    const { error } = await supabase.rpc('set_driver_premium', {
      target_driver_id: payload.driverId,
      next_is_premium: payload.isPremium
    });
    if (error) throw error;
  }
}

export async function getDriverRestaurantAssignments(driverId: string): Promise<{
  restaurants: Array<{ id: string; name: string }>;
  assignments: DriverRestaurantAssignment[];
}> {
  if (!supabase) {
    return {
      restaurants: [{ id: 'restaurant-demo', name: 'Демо-ресторан' }],
      assignments: []
    };
  }

  const [restaurantsResult, assignmentsResult] = await Promise.all([
    supabase
      .from('restaurants')
      .select('id, name')
      .order('name'),
    supabase
      .from('restaurant_couriers')
      .select('restaurant_id, is_primary, priority, courier_type, restaurants(name)')
      .eq('driver_id', driverId)
      .eq('is_active', true)
  ]);

  if (restaurantsResult.error) throw restaurantsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const restaurants = (restaurantsResult.data ?? []) as Array<{ id: string; name: string | null }>;
  const assignments = (assignmentsResult.data ?? []) as unknown as Array<{
    restaurant_id: string;
    is_primary: boolean | null;
    priority: number | null;
    courier_type: RestaurantCourierType | null;
    restaurants?: { name?: string | null } | Array<{ name?: string | null }> | null;
  }>;

  return {
    restaurants: restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name ?? 'Ресторан'
    })),
    assignments: assignments.map((assignment) => {
      const restaurant = Array.isArray(assignment.restaurants)
        ? assignment.restaurants[0]
        : assignment.restaurants;
      return {
        restaurantId: assignment.restaurant_id,
        restaurantName: restaurant?.name ?? 'Ресторан',
        isPrimary: assignment.is_primary ?? false,
        priority: Number(assignment.priority ?? 100),
        courierType: assignment.courier_type ?? null
      };
    })
  };
}

export async function saveDriverRestaurantAssignments(
  driverId: string,
  assignments: DriverRestaurantAssignment[]
) {
  if (!supabase) return;

  const { error } = await supabase.rpc('save_driver_restaurant_assignments', {
    target_driver_id: driverId,
    target_assignments: assignments.map((assignment, index) => ({
      restaurant_id: assignment.restaurantId,
      is_primary: assignment.isPrimary,
      priority: assignment.isPrimary ? 1 : Math.max(10, assignment.priority || index + 10),
      courier_type: assignment.courierType
    }))
  });
  if (error) throw error;
}
