import { z } from 'zod';

export const CHECHNYA_SEARCH_BOUNDS = {
  south: 42.4755818,
  north: 44.0105126,
  west: 44.8322725,
  east: 46.6627047
} as const;

export type DeliveryLocationSearchResult = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
};

type ParseDeliveryGeocoderResult =
  | { readonly success: true; readonly data: ReadonlyArray<DeliveryLocationSearchResult> }
  | { readonly success: false; readonly error: string };

type DeliveryGeocoderResponse = {
  readonly ok: boolean;
  readonly json: () => Promise<unknown>;
};

type DeliveryGeocoderFetcher = (url: string) => Promise<DeliveryGeocoderResponse>;

type CreateDeliveryGeocoderOptions = {
  readonly baseUrl?: string;
  readonly fetcher?: DeliveryGeocoderFetcher;
  readonly now?: () => number;
  readonly delay?: (milliseconds: number) => Promise<void>;
};

export interface DeliveryGeocoder {
  search(query: string): Promise<ReadonlyArray<DeliveryLocationSearchResult>>;
}

const nominatimSearchResultSchema = z.object({
  place_id: z.union([z.number(), z.string()]),
  lat: z.string(),
  lon: z.string(),
  name: z.string().optional(),
  display_name: z.string().min(1),
  address: z.record(z.string()).default({})
});

const nominatimSearchPayloadSchema = z.array(nominatimSearchResultSchema);
const publicNominatimUrl = import.meta.env?.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
const minimumSearchIntervalMs = 1_000;

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

const normalizedSearchKey = (query: string) => query.trim().toLocaleLowerCase('ru-RU');

const isInsideChechnyaSearchBounds = ({ lat, lng }: { readonly lat: number; readonly lng: number }) =>
  lat >= CHECHNYA_SEARCH_BOUNDS.south &&
  lat <= CHECHNYA_SEARCH_BOUNDS.north &&
  lng >= CHECHNYA_SEARCH_BOUNDS.west &&
  lng <= CHECHNYA_SEARCH_BOUNDS.east;

export const buildDeliveryGeocoderSearchUrl = ({
  baseUrl,
  query
}: {
  readonly baseUrl: string;
  readonly query: string;
}) => {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/search`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'ru');
  url.searchParams.set(
    'viewbox',
    `${CHECHNYA_SEARCH_BOUNDS.west},${CHECHNYA_SEARCH_BOUNDS.north},${CHECHNYA_SEARCH_BOUNDS.east},${CHECHNYA_SEARCH_BOUNDS.south}`
  );
  url.searchParams.set('bounded', '1');
  url.searchParams.set('accept-language', 'ru');
  return url.toString();
};

export const parseDeliveryGeocoderPayload = (payload: unknown): ParseDeliveryGeocoderResult => {
  const parsed = nominatimSearchPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: 'Сервис поиска вернул некорректные данные.' };
  }

  const data = parsed.data.flatMap((place) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (place.address['ISO3166-2-lvl4'] !== 'RU-CE') return [];
    if (!isInsideChechnyaSearchBounds({ lat, lng })) return [];

    const fallbackName = place.display_name.split(',')[0]?.trim() ?? place.display_name;
    return [{
      id: String(place.place_id),
      name: place.name?.trim() || fallbackName,
      label: place.display_name,
      lat,
      lng
    }];
  });

  return { success: true, data };
};

export const createDeliveryGeocoder = ({
  baseUrl = publicNominatimUrl,
  fetcher = (url) => fetch(url),
  now = Date.now,
  delay = wait
}: CreateDeliveryGeocoderOptions = {}): DeliveryGeocoder => {
  const cache = new Map<string, Promise<ReadonlyArray<DeliveryLocationSearchResult>>>();
  let nextRequestAt = 0;
  let requestQueue: Promise<void> = Promise.resolve();

  return {
    search(query) {
      const key = normalizedSearchKey(query);
      if (!key) return Promise.resolve([]);

      const cached = cache.get(key);
      if (cached) return cached;

      const execute = async () => {
        const delayMs = Math.max(0, nextRequestAt - now());
        if (delayMs > 0) await delay(delayMs);
        nextRequestAt = now() + minimumSearchIntervalMs;

        const response = await fetcher(buildDeliveryGeocoderSearchUrl({ baseUrl, query }));
        if (!response.ok) throw new Error('Сервис поиска временно недоступен.');
        const result = parseDeliveryGeocoderPayload(await response.json());
        if (!result.success) throw new Error(result.error);
        return result.data;
      };

      const request = requestQueue.then(execute, execute);
      requestQueue = request.then(() => undefined, () => undefined);
      cache.set(key, request);
      void request.catch(() => {
        cache.delete(key);
      });
      return request;
    }
  };
};

const deliveryGeocoder = createDeliveryGeocoder();

export const searchDeliveryLocations = (query: string) => deliveryGeocoder.search(query);
