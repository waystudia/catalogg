import { supabase } from '../supabase';

export type DriverLegalActivationStatus = 'awaiting_acceptance' | 'active' | 'legacy_active';

export type DriverLegalActivation = {
  readonly driverId: string;
  readonly status: DriverLegalActivationStatus;
  readonly activatedAt: string | null;
};

type DriverLegalActivationPayload = {
  driver_id?: unknown;
  status?: unknown;
  activated_at?: unknown;
};

const mapActivation = (value: unknown): DriverLegalActivation => {
  const payload = (value ?? {}) as DriverLegalActivationPayload;
  const status = payload.status;
  if (
    typeof payload.driver_id !== 'string' ||
    (status !== 'awaiting_acceptance' && status !== 'active' && status !== 'legacy_active')
  ) {
    throw new Error('Не удалось определить статус активации водителя.');
  }
  return {
    driverId: payload.driver_id,
    status,
    activatedAt: typeof payload.activated_at === 'string' ? payload.activated_at : null
  };
};

export async function getCurrentDriverLegalActivation(): Promise<DriverLegalActivation> {
  if (!supabase) {
    return { driverId: 'driver-demo', status: 'active', activatedAt: new Date().toISOString() };
  }

  const { data, error } = await supabase.rpc('get_current_driver_legal_activation');
  if (error) throw new Error(error.message || 'Не удалось загрузить активацию водителя.');
  return mapActivation(data);
}

export async function activateCurrentDriver(): Promise<DriverLegalActivation> {
  if (!supabase) {
    return { driverId: 'driver-demo', status: 'active', activatedAt: new Date().toISOString() };
  }

  const { data, error } = await supabase.rpc('activate_current_driver', {
    target_confirmations: {
      offer: true,
      personal_data: true,
      location: true
    }
  });
  if (error) throw new Error(error.message || 'Не удалось завершить активацию водителя.');
  return mapActivation(data);
}
