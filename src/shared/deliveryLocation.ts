export type DeliveryCoordinates = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>;

export const DELIVERY_TARGET_ACCURACY_M = 10;
export const DELIVERY_LOCATION_TIMEOUT_MS = 20_000;
export const DELIVERY_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: DELIVERY_LOCATION_TIMEOUT_MS,
  maximumAge: 0
};

export const chooseMoreAccuratePosition = <T extends DeliveryCoordinates>(
  current: T | null,
  candidate: T
) => {
  if (!current) return candidate;
  return candidate.accuracy < current.accuracy ? candidate : current;
};

export const deliveryPositionIsAccurateEnough = (
  coordinates: DeliveryCoordinates,
  targetAccuracyM: number
) => coordinates.accuracy <= targetAccuracyM;

export const normalizeDeliveryCoordinates = (coordinates: DeliveryCoordinates) => ({
  lat: Number(coordinates.latitude.toFixed(7)),
  lng: Number(coordinates.longitude.toFixed(7)),
  accuracyM: Math.max(0, Math.round(coordinates.accuracy))
});

export const formatDeliveryLocationNote = (
  lat: number | null | undefined,
  lng: number | null | undefined,
  accuracyM: number | null | undefined
) => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

  const accuracyNote =
    typeof accuracyM === 'number' && Number.isFinite(accuracyM)
      ? ` (точность ${Math.max(0, Math.round(accuracyM))} м)`
      : '';

  return `Координаты клиента: ${lat.toFixed(7)}, ${lng.toFixed(7)}${accuracyNote}`;
};

type StoredDeliveryLocationInput = {
  readonly lat: unknown;
  readonly lng: unknown;
  readonly accuracyM: unknown;
  readonly note: string;
};

const finiteNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validCoordinatePair = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;

export const resolveStoredDeliveryLocation = ({
  lat,
  lng,
  accuracyM,
  note
}: StoredDeliveryLocationInput): { readonly lat: number; readonly lng: number; readonly accuracyM: number | null } | null => {
  const explicitLat = finiteNumber(lat);
  const explicitLng = finiteNumber(lng);
  const explicitAccuracy = finiteNumber(accuracyM);
  const explicitLocation = validCoordinatePair(explicitLat, explicitLng);
  if (explicitLocation) {
    return {
      ...explicitLocation,
      accuracyM: explicitAccuracy === null ? null : Math.max(0, Math.round(explicitAccuracy))
    };
  }

  const match = note.match(/Координаты клиента:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*\(точность\s+(-?\d+(?:\.\d+)?)\s*м\))?/iu);
  if (!match) return null;
  const fallbackLat = finiteNumber(match[1]);
  const fallbackLng = finiteNumber(match[2]);
  const fallbackLocation = validCoordinatePair(fallbackLat, fallbackLng);
  if (!fallbackLocation) return null;
  const fallbackAccuracy = finiteNumber(match[3]);

  return {
    ...fallbackLocation,
    accuracyM: fallbackAccuracy === null ? null : Math.max(0, Math.round(fallbackAccuracy))
  };
};

export const deliveryGeolocationPermissionDeniedMessage =
  'Геолокация заблокирована. Разрешите доступ к местоположению в настройках сайта браузера и нажмите кнопку ещё раз.';

export const getDeliveryGeolocationErrorMessage = (
  error: Pick<GeolocationPositionError, 'code'> | null | undefined,
  fallback = 'Не удалось получить геолокацию. Проверьте разрешение браузера.'
) => (error?.code === 1 ? deliveryGeolocationPermissionDeniedMessage : fallback);
