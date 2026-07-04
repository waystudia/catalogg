import { supabase } from '../supabase';
import type { CreateDriverPayload, CreateDriverResult, PlatformDriver } from './platformTypes';

type DriverRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  photo_url: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
  status: string | null;
  rating: number | null;
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
    isActive: true,
    isOnline: true,
    status: 'online',
    rating: 4.9,
    createdAt: new Date().toISOString()
  }
];

const mapDriver = (row: DriverRow): PlatformDriver => ({
  id: row.id,
  userId: row.user_id ?? '',
  name: row.name ?? '',
  phone: row.phone ?? '',
  email: row.users?.email ?? '',
  vehicleInfo: row.vehicle_info ?? '',
  carNumber: row.car_number ?? '',
  photoUrl: row.photo_url ?? '',
  cityName: row.cities?.name ?? '',
  isActive: row.is_active ?? true,
  isOnline: row.is_online ?? false,
  status: row.status ?? 'offline',
  rating: Number(row.rating ?? 5),
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

  const { data, error } = await supabase
    .from('drivers')
    .select('id, user_id, name, phone, vehicle_info, car_number, photo_url, is_active, is_online, status, rating, created_at, users(email), cities(name)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as DriverRow[]).map(mapDriver);
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
