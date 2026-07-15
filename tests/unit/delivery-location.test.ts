import { describe, expect, it, vi } from 'vitest';
import {
  DELIVERY_GEOLOCATION_OPTIONS,
  DELIVERY_LOCATION_TIMEOUT_MS,
  DELIVERY_TARGET_ACCURACY_M,
  resolveStoredDeliveryLocation
} from '../../src/shared/deliveryLocation';
import {
  CHECHNYA_SEARCH_BOUNDS,
  buildDeliveryGeocoderSearchUrl,
  createDeliveryGeocoder,
  parseDeliveryGeocoderPayload
} from '../../src/shared/deliveryGeocoder';

describe('stored delivery location', () => {
  it('keeps precise browser tracking settings for delivery GPS capture', () => {
    expect(DELIVERY_TARGET_ACCURACY_M).toBe(10);
    expect(DELIVERY_LOCATION_TIMEOUT_MS).toBe(20_000);
    expect(DELIVERY_GEOLOCATION_OPTIONS).toEqual({
      enableHighAccuracy: true,
      timeout: DELIVERY_LOCATION_TIMEOUT_MS,
      maximumAge: 0
    });
  });

  it('prefers valid explicit numeric fields and normalizes accuracy', () => {
    expect(resolveStoredDeliveryLocation({
      lat: '43.3021000',
      lng: '45.7052000',
      accuracyM: -4.6,
      note: 'Координаты клиента: 1, 2 (точность 9 м)'
    })).toEqual({ lat: 43.3021, lng: 45.7052, accuracyM: 0 });
  });

  it('restores legacy coordinates and accuracy from the order comment', () => {
    expect(resolveStoredDeliveryLocation({
      lat: null,
      lng: null,
      accuracyM: null,
      note: 'Домофон 7\nКоординаты клиента: 43.2471234, 45.6887654 (точность 13.6 м)'
    })).toEqual({ lat: 43.2471234, lng: 45.6887654, accuracyM: 14 });
  });

  it('rejects incomplete and out-of-range coordinate pairs', () => {
    expect(resolveStoredDeliveryLocation({ lat: 90, lng: 180, accuracyM: null, note: '' }))
      .toEqual({ lat: 90, lng: 180, accuracyM: null });
    expect(resolveStoredDeliveryLocation({ lat: 91, lng: 45, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({ lat: 45, lng: 181, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({ lat: 43, lng: null, accuracyM: 1, note: '' })).toBeNull();
    expect(resolveStoredDeliveryLocation({
      lat: null,
      lng: null,
      accuracyM: null,
      note: 'Координаты клиента: -91, 181'
    })).toBeNull();
  });

  it('accepts integer legacy coordinates without an accuracy suffix and ignores blank explicit values', () => {
    expect(resolveStoredDeliveryLocation({
      lat: '   ',
      lng: '45',
      accuracyM: null,
      note: 'Координаты клиента: 43, 45'
    })).toEqual({ lat: 43, lng: 45, accuracyM: null });
  });
});

describe('Chechnya delivery place search', () => {
  const chechnyaResult = {
    place_id: 208046098,
    lat: '43.2406960',
    lon: '45.9976840',
    name: 'Цоци-Юрт',
    display_name: 'Цоци-Юрт, Курчалоевский район, Чеченская Республика, Россия',
    address: {
      town: 'Цоци-Юрт',
      state: 'Чеченская Республика',
      'ISO3166-2-lvl4': 'RU-CE',
      country_code: 'ru'
    }
  };

  it('builds an explicit bounded Nominatim request for the Chechen Republic', () => {
    const url = new URL(buildDeliveryGeocoderSearchUrl({
      baseUrl: 'https://nominatim.openstreetmap.org///',
      query: ' Цоци-Юрт '
    }));

    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Цоци-Юрт',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '6',
      countrycodes: 'ru',
      viewbox: `${CHECHNYA_SEARCH_BOUNDS.west},${CHECHNYA_SEARCH_BOUNDS.north},${CHECHNYA_SEARCH_BOUNDS.east},${CHECHNYA_SEARCH_BOUNDS.south}`,
      bounded: '1',
      'accept-language': 'ru'
    });
  });

  it('accepts only valid RU-CE results inside the Chechnya bounds', () => {
    expect(parseDeliveryGeocoderPayload([
      chechnyaResult,
      {
        ...chechnyaResult,
        place_id: 2,
        lat: '43.1200000',
        lon: '44.9000000',
        name: 'Назрань',
        address: { ...chechnyaResult.address, 'ISO3166-2-lvl4': 'RU-IN' }
      },
      {
        ...chechnyaResult,
        place_id: 3,
        lat: String(CHECHNYA_SEARCH_BOUNDS.south - 0.0000001)
      }
    ])).toEqual({
      success: true,
      data: [{
        id: '208046098',
        name: 'Цоци-Юрт',
        label: 'Цоци-Юрт, Курчалоевский район, Чеченская Республика, Россия',
        lat: 43.240696,
        lng: 45.997684
      }]
    });

    expect(parseDeliveryGeocoderPayload([{ ...chechnyaResult, lat: String(CHECHNYA_SEARCH_BOUNDS.south) }])).toEqual({
      success: true,
      data: [{
        id: '208046098',
        name: 'Цоци-Юрт',
        label: chechnyaResult.display_name,
        lat: CHECHNYA_SEARCH_BOUNDS.south,
        lng: 45.997684
      }]
    });
  });

  it('includes every exact Chechnya bounding edge and rejects values beyond each edge', () => {
    const boundaries = [
      { place_id: 10, lat: String(CHECHNYA_SEARCH_BOUNDS.south), lon: '45.7' },
      { place_id: 11, lat: String(CHECHNYA_SEARCH_BOUNDS.north), lon: '45.7' },
      { place_id: 12, lat: '43.4', lon: String(CHECHNYA_SEARCH_BOUNDS.west) },
      { place_id: 13, lat: '43.4', lon: String(CHECHNYA_SEARCH_BOUNDS.east) }
    ].map((coordinates) => ({ ...chechnyaResult, ...coordinates }));
    const outside = [
      { place_id: 20, lat: String(CHECHNYA_SEARCH_BOUNDS.south - 0.0000001), lon: '45.7' },
      { place_id: 21, lat: String(CHECHNYA_SEARCH_BOUNDS.north + 0.0000001), lon: '45.7' },
      { place_id: 22, lat: '43.4', lon: String(CHECHNYA_SEARCH_BOUNDS.west - 0.0000001) },
      { place_id: 23, lat: '43.4', lon: String(CHECHNYA_SEARCH_BOUNDS.east + 0.0000001) }
    ].map((coordinates) => ({ ...chechnyaResult, ...coordinates }));

    const parsed = parseDeliveryGeocoderPayload([...boundaries, ...outside]);
    expect(parsed.success && parsed.data.map((result) => result.id)).toEqual(['10', '11', '12', '13']);
  });

  it('uses the first display-name segment when the provider omits a short name', () => {
    expect(parseDeliveryGeocoderPayload([{
      ...chechnyaResult,
      name: undefined,
      display_name: '  Цоци-Юрт  , Курчалоевский район, Чеченская Республика, Россия'
    }])).toEqual({
      success: true,
      data: [{
        id: '208046098',
        name: 'Цоци-Юрт',
        label: '  Цоци-Юрт  , Курчалоевский район, Чеченская Республика, Россия',
        lat: 43.240696,
        lng: 45.997684
      }]
    });

    const named = parseDeliveryGeocoderPayload([{ ...chechnyaResult, name: '  Цоци-Юрт  ' }]);
    expect(named.success && named.data[0]?.name).toBe('Цоци-Юрт');
  });

  it('drops results with either non-numeric latitude or non-numeric longitude', () => {
    expect(parseDeliveryGeocoderPayload([
      { ...chechnyaResult, place_id: 31, lat: 'not-a-latitude' },
      { ...chechnyaResult, place_id: 32, lon: 'not-a-longitude' }
    ])).toEqual({ success: true, data: [] });
  });

  it('rejects malformed provider payloads at the API boundary', () => {
    expect(parseDeliveryGeocoderPayload({ error: 'rate limited' })).toEqual({
      success: false,
      error: 'Сервис поиска вернул некорректные данные.'
    });
  });

  it('caches normalized repeated searches and spaces different requests by one second', async () => {
    let currentTime = 5_000;
    const delays: number[] = [];
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [chechnyaResult]
    }));
    const geocoder = createDeliveryGeocoder({
      baseUrl: 'https://geocoder.example',
      fetcher,
      now: () => currentTime,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
        currentTime += milliseconds;
      }
    });

    const first = await geocoder.search(' Цоци-Юрт ');
    const cached = await geocoder.search('цоци-юрт');
    await geocoder.search('Грозный');

    expect(first).toEqual(cached);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1_000]);
  });

  it('does not contact the provider for a blank query', async () => {
    const fetcher = vi.fn();
    const geocoder = createDeliveryGeocoder({ fetcher });

    await expect(geocoder.search('   ')).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not keep failed requests in the cache and reports provider errors', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => [chechnyaResult] });
    const geocoder = createDeliveryGeocoder({
      fetcher,
      now: () => 10_000,
      delay: async () => undefined
    });

    await expect(geocoder.search('Шали')).rejects.toThrow('Сервис поиска временно недоступен.');
    await expect(geocoder.search('Шали')).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports an invalid successful response instead of exposing untrusted provider data', async () => {
    const geocoder = createDeliveryGeocoder({
      fetcher: vi.fn(async () => ({ ok: true, json: async () => ({ error: 'unexpected' }) }))
    });

    await expect(geocoder.search('Гудермес')).rejects.toThrow('Сервис поиска вернул некорректные данные.');
  });

  it('uses the default scheduler when a second provider request must wait', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ({ ok: true, json: async () => [chechnyaResult] }));
      const geocoder = createDeliveryGeocoder({ fetcher, now: () => 20_000 });

      await geocoder.search('Аргун');
      const waitingSearch = geocoder.search('Урус-Мартан');
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      await waitingSearch;

      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
