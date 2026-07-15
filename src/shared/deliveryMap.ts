export type DeliveryMapCoordinates = {
  lat: number;
  lng: number;
};

export type DeliveryMapPoint = {
  x: number;
  y: number;
};

export type DeliveryMapCoordinateInput = {
  lat: number | null | undefined;
  lng: number | null | undefined;
};

export type OsmTile = {
  key: string;
  url: string;
  overlayUrls?: readonly string[];
  x: number;
  y: number;
};

export type DeliveryMapStyle = 'street' | 'satellite';

export type DeliveryMapTile = OsmTile & {
  readonly overlayUrls: readonly string[];
};

type BuildMapTileGridInput = {
  readonly center: DeliveryMapCoordinates;
  readonly zoom: number;
  readonly mapSize: number;
  readonly style: DeliveryMapStyle;
};

const tileSize = 256;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getMapCenter = (points: readonly DeliveryMapCoordinateInput[]): DeliveryMapCoordinates => {
  const validPoints = points.filter(
    (point): point is { lat: number; lng: number } =>
      typeof point.lat === 'number' && Number.isFinite(point.lat) &&
      typeof point.lng === 'number' && Number.isFinite(point.lng)
  );

  if (validPoints.length === 0) return { lat: 43.3184, lng: 45.6927 };

  return {
    lat: Number((validPoints.reduce((sum, point) => sum + point.lat, 0) / validPoints.length).toFixed(7)),
    lng: Number((validPoints.reduce((sum, point) => sum + point.lng, 0) / validPoints.length).toFixed(7))
  };
};

export const getMapZoomForPoints = (points: readonly DeliveryMapCoordinateInput[]) => {
  const validPoints = points.filter(
    (point): point is { lat: number; lng: number } =>
      typeof point.lat === 'number' && Number.isFinite(point.lat) &&
      typeof point.lng === 'number' && Number.isFinite(point.lng)
  );
  if (validPoints.length < 2) return 15;

  const latSpan = Math.max(...validPoints.map((point) => point.lat)) - Math.min(...validPoints.map((point) => point.lat));
  const lngSpan = Math.max(...validPoints.map((point) => point.lng)) - Math.min(...validPoints.map((point) => point.lng));
  const span = Math.max(latSpan, lngSpan);

  if (span > 0.8) return 10;
  if (span > 0.25) return 11;
  if (span > 0.1) return 12;
  if (span > 0.04) return 13;
  if (span > 0.015) return 14;
  return 15;
};

const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

const latLngToWorldPixel = ({ lat, lng }: DeliveryMapCoordinates, zoom: number) => {
  const scale = tileSize * 2 ** zoom;
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((safeLat * Math.PI) / 180);

  return {
    x: ((normalizeLng(lng) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
};

const worldPixelToLatLng = ({ x, y }: DeliveryMapPoint, zoom: number): DeliveryMapCoordinates => {
  const scale = tileSize * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lng: normalizeLng(lng) };
};

export const coordinatesToMapPoint = (
  coordinates: DeliveryMapCoordinates,
  center: DeliveryMapCoordinates,
  zoom: number,
  mapSize: number
): DeliveryMapPoint => {
  const centerPixel = latLngToWorldPixel(center, zoom);
  const coordinatePixel = latLngToWorldPixel(coordinates, zoom);

  return {
    x: Math.round(clamp(mapSize / 2 + coordinatePixel.x - centerPixel.x, 0, mapSize)),
    y: Math.round(clamp(mapSize / 2 + coordinatePixel.y - centerPixel.y, 0, mapSize))
  };
};

export const mapPointToCoordinates = (
  point: DeliveryMapPoint,
  center: DeliveryMapCoordinates,
  zoom: number,
  mapSize: number
): DeliveryMapCoordinates => {
  const centerPixel = latLngToWorldPixel(center, zoom);
  const x = centerPixel.x + clamp(point.x, 0, mapSize) - mapSize / 2;
  const y = centerPixel.y + clamp(point.y, 0, mapSize) - mapSize / 2;
  return worldPixelToLatLng({ x, y }, zoom);
};

export const buildOsmTileGrid = (
  center: DeliveryMapCoordinates,
  zoom: number,
  mapSize: number
): OsmTile[] => {
  const centerPixel = latLngToWorldPixel(center, zoom);
  const startX = centerPixel.x - mapSize / 2;
  const startY = centerPixel.y - mapSize / 2;
  const firstTileX = Math.floor(startX / tileSize);
  const firstTileY = Math.floor(startY / tileSize);
  const lastTileX = Math.floor((startX + mapSize) / tileSize);
  const lastTileY = Math.floor((startY + mapSize) / tileSize);
  const tileCount = 2 ** zoom;
  const tiles: OsmTile[] = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) continue;

    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}-${wrappedTileX}-${tileY}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
        x: Math.round(tileX * tileSize - startX),
        y: Math.round(tileY * tileSize - startY)
      });
    }
  }

  return tiles;
};

const streetTileTemplate = import.meta.env?.VITE_STREET_TILE_URL ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const satelliteTileTemplate = import.meta.env?.VITE_SATELLITE_TILE_URL ??
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const satelliteOverlayTemplates = [
  import.meta.env?.VITE_SATELLITE_ROADS_TILE_URL ??
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  import.meta.env?.VITE_SATELLITE_LABELS_TILE_URL ??
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
] as const;

const resolveTileUrl = ({
  template,
  zoom,
  tileX,
  tileY
}: {
  readonly template: string;
  readonly zoom: number;
  readonly tileX: number;
  readonly tileY: number;
}) => template
  .replace('{z}', String(zoom))
  .replace('{x}', String(tileX))
  .replace('{y}', String(tileY));

export const buildMapTileGrid = ({
  center,
  zoom,
  mapSize,
  style
}: BuildMapTileGridInput): DeliveryMapTile[] => buildOsmTileGrid(center, zoom, mapSize).map((tile) => {
  const [, tileX, tileY] = tile.key.split('-');
  const coordinates = {
    zoom,
    tileX: Number(tileX),
    tileY: Number(tileY)
  };
  const isSatellite = style === 'satellite';

  return {
    ...tile,
    url: resolveTileUrl({
      template: isSatellite ? satelliteTileTemplate : streetTileTemplate,
      ...coordinates
    }),
    overlayUrls: isSatellite
      ? satelliteOverlayTemplates.map((template) => resolveTileUrl({ template, ...coordinates }))
      : []
  };
});
