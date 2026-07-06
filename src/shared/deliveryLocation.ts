export type DeliveryCoordinates = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>;

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
