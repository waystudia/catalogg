import type { PlatformDeliverySettlement } from './api/platformTypes';

type DeliveryPlace = Pick<PlatformDeliverySettlement, 'cityName' | 'settlementName'>;

const normalizePlace = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

const uniquePlaces = (values: string[]) => {
  const unique = new Map<string, string>();
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizePlace(trimmed);
    if (key && !unique.has(key)) unique.set(key, trimmed);
  });
  return Array.from(unique.values()).sort((left, right) => left.localeCompare(right, 'ru-RU'));
};

export const getDeliveryCityOptions = (places: readonly DeliveryPlace[]) =>
  uniquePlaces(places.map((place) => place.cityName));

export const getDeliverySettlementOptions = (
  places: readonly DeliveryPlace[],
  primaryCity: string
) => {
  const normalizedCity = normalizePlace(primaryCity);
  if (!normalizedCity) return [];

  return uniquePlaces(
    places
      .filter((place) => normalizePlace(place.cityName) === normalizedCity)
      .map((place) => place.settlementName)
  );
};

export const keepSettlementsAvailableForCity = (
  selectedSettlements: readonly string[],
  places: readonly DeliveryPlace[],
  primaryCity: string
) => {
  const available = new Set(
    getDeliverySettlementOptions(places, primaryCity).map(normalizePlace)
  );

  return uniquePlaces(
    selectedSettlements.filter((settlement) => available.has(normalizePlace(settlement)))
  );
};
