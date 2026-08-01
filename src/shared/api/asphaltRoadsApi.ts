import { z } from 'zod';
import { supabase } from '../supabase';
import {
  normalizeAsphaltRoadPoints,
  type AsphaltRoadCorridor
} from '../asphaltRoads';
import type { DeliveryMapCoordinates } from '../deliveryMap';

type AsphaltRoadCorridorRow = {
  id: string;
  group_name?: string | null;
  name: string;
  points: unknown;
  created_at: string;
  updated_at: string;
};

const pointSchema = z.object({
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180)
});
const pointsSchema = z.array(pointSchema).min(2).max(100);
const localStorageKey = 'waycatalog-asphalt-road-corridors-v1';

const mapRow = (row: AsphaltRoadCorridorRow): AsphaltRoadCorridor | null => {
  const parsedPoints = pointsSchema.safeParse(row.points);
  if (!parsedPoints.success) return null;
  return {
    id: row.id,
    groupName: row.group_name?.trim() || 'Без группы',
    name: row.name,
    points: parsedPoints.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const readLocalCorridors = (): AsphaltRoadCorridor[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(localStorageKey) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as AsphaltRoadCorridorRow;
      const corridor = mapRow(row);
      return corridor ? [corridor] : [];
    });
  } catch {
    return [];
  }
};

const writeLocalCorridors = (corridors: ReadonlyArray<AsphaltRoadCorridor>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(localStorageKey, JSON.stringify(corridors.map((corridor) => ({
    id: corridor.id,
    group_name: corridor.groupName,
    name: corridor.name,
    points: corridor.points,
    created_at: corridor.createdAt,
    updated_at: corridor.updatedAt
  }))));
};

export async function getAsphaltRoadCorridors(): Promise<AsphaltRoadCorridor[]> {
  if (!supabase) return readLocalCorridors();
  const { data, error } = await supabase
    .from('asphalt_road_corridors')
    .select('id, group_name, name, points, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AsphaltRoadCorridorRow[])
    .map(mapRow)
    .filter((value): value is AsphaltRoadCorridor => value !== null);
}

export async function saveAsphaltRoadCorridor(input: {
  readonly id?: string;
  readonly groupName: string;
  readonly name: string;
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
}): Promise<void> {
  const name = input.name.trim();
  const groupName = input.groupName.trim();
  const points = normalizeAsphaltRoadPoints(input.points);
  if (!name) throw new Error('Введите название участка.');
  if (!groupName) throw new Error('Введите село, город или название группы.');
  if (points.length < 2) throw new Error('Укажите начало и конец асфальтового участка.');

  const now = new Date().toISOString();
  if (!supabase) {
    const corridors = readLocalCorridors();
    const existing = input.id ? corridors.find((corridor) => corridor.id === input.id) : null;
    const next: AsphaltRoadCorridor = {
      id: input.id ?? crypto.randomUUID(),
      groupName,
      name,
      points,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    writeLocalCorridors([next, ...corridors.filter((corridor) => corridor.id !== next.id)]);
    return;
  }

  const payload = { group_name: groupName, name, points, updated_at: now };
  const result = input.id
    ? await supabase.from('asphalt_road_corridors').update(payload).eq('id', input.id)
    : await supabase.from('asphalt_road_corridors').insert(payload);
  if (result.error) throw result.error;
}

export async function deleteAsphaltRoadCorridor(id: string): Promise<void> {
  if (!supabase) {
    writeLocalCorridors(readLocalCorridors().filter((corridor) => corridor.id !== id));
    return;
  }
  const { error } = await supabase.from('asphalt_road_corridors').delete().eq('id', id);
  if (error) throw error;
}
