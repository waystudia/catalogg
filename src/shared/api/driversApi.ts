import { supabase } from '../supabase';
import type { CreateDriverPayload, CreateDriverResult, PlatformDriver, UpdateDriverPayload } from './platformTypes';

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
  status: string | null;
  rating: number | null;
  debt_amount?: number | string | null;
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
    status: 'online',
    rating: 4.9,
    debt: 0,
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
  status: row.status ?? 'offline',
  rating: Number(row.rating ?? 5),
  debt: Number(row.debt_amount ?? 0),
  createdAt: row.created_at
});

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
    .select('id, user_id, name, phone, vehicle_info, car_number, photo_url, city_name, service_settlements, is_active, is_online, status, rating, debt_amount, created_at, users(email), cities(name)')
    .order('created_at', { ascending: false });

  if (!result.error) {
    return ((result.data ?? []) as unknown as DriverRow[]).map(mapDriver);
  }

  const fallback = await supabase
    .from('drivers')
    .select('id, user_id, email, name, phone, vehicle_info, car_number, photo_url, city_name, service_settlements, is_active, is_online, status, rating, created_at')
    .order('created_at', { ascending: false });

  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as unknown as DriverRow[]).map(mapDriver);
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
    return;
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
}
