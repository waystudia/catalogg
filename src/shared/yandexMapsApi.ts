export const YANDEX_TILES_FREE_RPS_LIMIT = 30;
export const YANDEX_NAVIGATOR_FREE_DAILY_TRANSITION_LIMIT = 5_000;

export type YandexTileRequest = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale?: 0.5 | 1 | 2;
  readonly language?: 'ru_RU';
  readonly projection?: 'web_mercator' | 'wgs84_mercator';
};

const integerCoordinate = (value: number, label: string, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`Некорректный параметр тайла: ${label}`);
  return value;
};

export const getConfiguredYandexTilesApiKey = () => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_YANDEX_TILES_API_KEY?.trim() ?? '';
};

export const buildYandexTileUrl = (
  request: YandexTileRequest,
  apiKey = getConfiguredYandexTilesApiKey()
) => {
  if (!apiKey.trim()) throw new Error('Не настроен VITE_YANDEX_TILES_API_KEY.');
  const params = new URLSearchParams({
    x: String(integerCoordinate(request.x, 'x')),
    y: String(integerCoordinate(request.y, 'y')),
    z: String(integerCoordinate(request.z, 'z', 20)),
    lang: request.language ?? 'ru_RU',
    l: 'map',
    apikey: apiKey.trim()
  });
  if (request.scale !== undefined) params.set('scale', String(request.scale));
  if (request.projection) params.set('projection', request.projection);
  return `https://tiles.api-maps.yandex.ru/v1/tiles/?${params.toString()}`;
};

export const getYandexMapsApiReadiness = () => ({
  tilesConfigured: Boolean(getConfiguredYandexTilesApiKey()),
  tilesFreeRpsLimit: YANDEX_TILES_FREE_RPS_LIMIT,
  navigatorDailyTransitionLimit: YANDEX_NAVIGATOR_FREE_DAILY_TRANSITION_LIMIT
});
