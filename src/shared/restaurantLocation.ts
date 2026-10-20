export type RestaurantCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

export const parseCoordinateInput = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? Number(number.toFixed(7)) : null;
};

export const isValidRestaurantCoordinates = (lat: number | null, lng: number | null) =>
  lat !== null &&
  lng !== null &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

export const makeRestaurantCoordinates = (lat: number | null, lng: number | null): RestaurantCoordinates | null =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180
    ? { lat, lng }
    : null;

export const buildYandexMapLink = (lat: number, lng: number) =>
  `https://yandex.ru/maps/?ll=${lng},${lat}&z=16&pt=${lng},${lat},pm2rdm`;

export const buildRestaurantMapUrl = ({
  lat,
  lng,
  mapLink,
  city,
  address
}: {
  lat: number | null;
  lng: number | null;
  mapLink?: string | null;
  city?: string | null;
  address?: string | null;
}) => {
  const coordinates = makeRestaurantCoordinates(lat, lng);
  if (coordinates) return buildYandexMapLink(coordinates.lat, coordinates.lng);

  const explicitLink = mapLink?.trim();
  if (explicitLink) return explicitLink;

  const searchText = Array.from(
    new Set([city, address].map((value) => value?.trim()).filter(Boolean))
  ).join(', ');
  return searchText ? `https://yandex.ru/maps/?text=${encodeURIComponent(searchText)}` : '';
};

const parseYandexLngLat = (value: string | null) => {
  const match = value?.match(/(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const lng = parseCoordinateInput(match[1]);
  const lat = parseCoordinateInput(match[2]);
  return makeRestaurantCoordinates(lat, lng);
};

export const parseRestaurantCoordinatesFromMapLink = (value: string) => {
  const text = value.trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    const directPoint =
      parseYandexLngLat(url.searchParams.get('pt')) ??
      parseYandexLngLat(url.searchParams.get('ll')) ??
      parseYandexLngLat(url.searchParams.get('sll'));
    if (directPoint) return directPoint;
  } catch {
    // Fall back to parsing pasted coordinate text below.
  }

  const decodedText = decodeURIComponent(text);
  const yandexParamMatch = decodedText.match(/(?:pt|ll|sll)=(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)/);
  if (yandexParamMatch) {
    const lng = parseCoordinateInput(yandexParamMatch[1]);
    const lat = parseCoordinateInput(yandexParamMatch[2]);
    return makeRestaurantCoordinates(lat, lng);
  }

  const match = decodedText.match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!match) return null;
  const lat = parseCoordinateInput(match[1]);
  const lng = parseCoordinateInput(match[2]);
  return makeRestaurantCoordinates(lat, lng);
};
