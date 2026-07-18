import { Home, Layers3, LocateFixed, MapPin, Minus, Navigation, Plus, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  buildMapTileGrid,
  calculateBearing,
  coordinatesToMapPoint,
  getMapCenter,
  getMapZoomForPoints,
  mapPointToCoordinates,
  rotateMapPoint,
  type DeliveryMapCoordinates,
  type DeliveryMapStyle
} from './deliveryMap';
import { searchDeliveryLocations, type DeliveryLocationSearchResult } from './deliveryGeocoder';
import { loadRoadRoute, type RoadRoute } from './deliveryNavigation';
import './delivery-tracking-map.css';

type TrackingPoint = DeliveryMapCoordinates & {
  label: string;
  address?: string;
  details?: readonly string[];
};

type DeliveryTrackingMapProps = {
  restaurant: TrackingPoint;
  client: TrackingPoint;
  driver?: TrackingPoint | null;
  className?: string;
  initialStyle?: DeliveryMapStyle;
  routePoints?: ReadonlyArray<DeliveryMapCoordinates>;
  loadRoute?: (points: ReadonlyArray<DeliveryMapCoordinates>) => Promise<RoadRoute>;
  enableSearch?: boolean;
  searchLocations?: (query: string) => Promise<ReadonlyArray<DeliveryLocationSearchResult>>;
  followDriverHeading?: boolean;
};

const mapSize = 640;
const defaultRouteLoader = (points: ReadonlyArray<DeliveryMapCoordinates>) => loadRoadRoute({ points });
const formatRouteDistance = (distanceM: number) => `${new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}).format(distanceM / 1000)} км`;

const formatRouteDuration = (durationS: number) => `${Math.max(1, Math.round(durationS / 60))} мин`;

export function DeliveryTrackingMap({
  restaurant,
  client,
  driver,
  className = '',
  initialStyle = 'street',
  routePoints,
  loadRoute = defaultRouteLoader,
  enableSearch = false,
  searchLocations = searchDeliveryLocations,
  followDriverHeading = false
}: DeliveryTrackingMapProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; center: DeliveryMapCoordinates; zoom: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; angle: number; zoom: number; rotation: number } | null>(null);
  const wheelDeltaRef = useRef(0);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<DeliveryMapStyle>(initialStyle);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [selectedPointKind, setSelectedPointKind] = useState<'restaurant' | 'driver' | 'client' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReadonlyArray<DeliveryLocationSearchResult>>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const routePointKey = (routePoints ?? [restaurant, client])
    .map((point) => `${point.lat},${point.lng}`)
    .join('|');
  const effectiveRoutePoints = useMemo<ReadonlyArray<DeliveryMapCoordinates>>(
    () => routePointKey.split('|').filter(Boolean).map((pair) => {
      const [lat, lng] = pair.split(',').map(Number);
      return { lat, lng };
    }),
    [routePointKey]
  );
  const defaultCenter = useMemo(
    () => getMapCenter([
      { lat: restaurant.lat, lng: restaurant.lng },
      { lat: client.lat, lng: client.lng }
    ]),
    [client.lat, client.lng, restaurant.lat, restaurant.lng]
  );
  const defaultMapZoom = useMemo(
    () => getMapZoomForPoints([
      { lat: restaurant.lat, lng: restaurant.lng },
      { lat: client.lat, lng: client.lng }
    ]),
    [client.lat, client.lng, restaurant.lat, restaurant.lng]
  );
  const [center, setCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultMapZoom);
  const [manualRotation, setManualRotation] = useState(0);
  useEffect(() => {
    setCenter(defaultCenter);
    setMapZoom(defaultMapZoom);
    setSelectedPointKind(null);
    setManualRotation(0);
  }, [defaultCenter, defaultMapZoom]);
  const tiles = useMemo(
    () => buildMapTileGrid({ center, zoom: mapZoom, mapSize, style: mapStyle }),
    [center, mapStyle, mapZoom]
  );
  const projectedPoints = useMemo(
    () => [restaurant, client, ...(driver ? [driver] : [])].map((point) => ({
      ...point,
      ...coordinatesToMapPoint(point, center, mapZoom, mapSize, { clampToViewport: false })
    })),
    [center, mapZoom, restaurant, client, driver]
  );
  const restaurantPoint = projectedPoints[0];
  const clientPoint = projectedPoints[1];
  const driverPoint = driver ? projectedPoints[2] : null;
  const driverHeading = useMemo(() => {
    if (!driver) return 0;
    const routeTarget = effectiveRoutePoints.find((point) =>
      Math.abs(point.lat - driver.lat) > 0.000001 || Math.abs(point.lng - driver.lng) > 0.000001
    );
    if (routeTarget) return calculateBearing(driver, routeTarget);
    return calculateBearing(driver, client);
  }, [client, driver, effectiveRoutePoints]);
  const mapRotation = (followDriverHeading && driver ? -driverHeading : 0) + manualRotation;
  const selectedPoint =
    selectedPointKind === 'restaurant'
      ? restaurantPoint
      : selectedPointKind === 'client'
        ? clientPoint
        : selectedPointKind === 'driver'
          ? driverPoint
          : null;
  const selectedPointPosition = selectedPoint
    ? rotateMapPoint(selectedPoint, mapRotation, { x: mapSize / 2, y: mapSize / 2 })
    : null;
  const fallbackRoutePoints = useMemo(
    () => effectiveRoutePoints.map((point) => coordinatesToMapPoint(point, center, mapZoom, mapSize, { clampToViewport: false })),
    [center, effectiveRoutePoints, mapZoom]
  );
  const projectedRoadRoute = useMemo(
    () => roadRoute?.geometry.map((point) => coordinatesToMapPoint(point, center, mapZoom, mapSize, { clampToViewport: false })) ?? fallbackRoutePoints,
    [center, fallbackRoutePoints, mapZoom, roadRoute]
  );

  useEffect(() => {
    if (effectiveRoutePoints.length < 2) {
      setRoadRoute(null);
      return undefined;
    }

    let active = true;
    setRoadRoute(null);
    void loadRoute(effectiveRoutePoints)
      .then((route) => {
        if (active) setRoadRoute(route);
      })
      .catch(() => {
        if (active) setRoadRoute(null);
      });

    return () => {
      active = false;
    };
  }, [effectiveRoutePoints, loadRoute]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const updateScale = () => setScale(Math.min(1, canvas.clientWidth / mapSize));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!followDriverHeading || !driver) return;
    setCenter({ lat: driver.lat, lng: driver.lng });
    setMapZoom((zoom) => Math.max(17, zoom));
  }, [driver, followDriverHeading]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, center, zoom: mapZoom };
    setIsDragging(true);
  };

  const dragMap = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = (event.clientX - start.x) / scale;
    const dy = (event.clientY - start.y) / scale;
    setCenter(mapPointToCoordinates({ x: mapSize / 2 - dx, y: mapSize / 2 - dy }, start.center, start.zoom, mapSize));
  };

  const endDrag = () => {
    dragStartRef.current = null;
    pinchStartRef.current = null;
    activePointersRef.current.clear();
    setIsDragging(false);
  };

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size === 0) {
      endDrag();
      return;
    }

    pinchStartRef.current = null;
    const remaining = Array.from(activePointersRef.current.values())[0];
    dragStartRef.current = remaining
      ? { x: remaining.x, y: remaining.y, center, zoom: mapZoom }
      : null;
  };

  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const getPinchDistance = () => {
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length < 2) return null;
    const [first, second] = pointers;
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const getPinchAngle = () => {
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length < 2) return null;
    const [first, second] = pointers;
    return (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
  };

  const submitSearch = async () => {
    const query = searchQuery.trim();
    if (!query || isSearching) return;
    setIsSearching(true);
    setSearchMessage('');
    setSearchResults([]);

    try {
      const results = await searchLocations(query);
      setSearchResults(results);
      if (results.length === 0) setSearchMessage('В Чеченской Республике ничего не найдено.');
    } catch (searchError) {
      setSearchMessage(searchError instanceof Error ? searchError.message : 'Не удалось выполнить поиск на карте.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result: DeliveryLocationSearchResult) => {
    setCenter({ lat: result.lat, lng: result.lng });
    setMapZoom(16);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearchMessage('');
  };

  const focusPoint = (kind: 'restaurant' | 'driver' | 'client', point: TrackingPoint) => {
    setSelectedPointKind(kind);
    setCenter({ lat: point.lat, lng: point.lng });
    setMapZoom((zoom) => Math.min(17, Math.max(15, zoom + 0.55)));
  };

  const centerOnDriver = () => {
    setManualRotation(0);
    if (driver) {
      setCenter({ lat: driver.lat, lng: driver.lng });
      setMapZoom(16);
      return;
    }
    setCenter(defaultCenter);
    setMapZoom(defaultMapZoom);
  };

  return (
    <section className={`delivery-tracking-map ${className}`.trim()} aria-label="Карта доставки">
      {enableSearch && (
        <div className="delivery-tracking-map__search-wrap">
          <form
            className="delivery-tracking-map__search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSearch();
            }}
          >
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label="Поиск на карте"
              placeholder="Село, город или улица"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button type="submit" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? 'Ищем...' : 'Найти'}
            </button>
          </form>
          <button className="delivery-tracking-map__locate" type="button" onClick={centerOnDriver} aria-label="Моё местоположение">
            <LocateFixed />
          </button>
          {(searchResults.length > 0 || searchMessage) && (
            <div className="delivery-tracking-map__search-results" aria-live="polite">
              {searchResults.map((result) => (
                <button type="button" key={result.id} onClick={() => selectSearchResult(result)}>
                  <MapPin aria-hidden="true" />
                  <span>{result.label}</span>
                </button>
              ))}
              {searchMessage && <p>{searchMessage}</p>}
            </div>
          )}
        </div>
      )}
      <div
        className={isDragging ? 'delivery-tracking-map__canvas is-dragging' : 'delivery-tracking-map__canvas'}
        ref={canvasRef}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button, input')) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          trackPointer(event);
          if (activePointersRef.current.size === 2) {
            const distance = getPinchDistance();
            const angle = getPinchAngle();
            if (distance !== null && angle !== null) {
              pinchStartRef.current = { distance, angle, zoom: mapZoom, rotation: manualRotation };
              dragStartRef.current = null;
              setIsDragging(true);
            }
            return;
          }
          startDrag(event);
        }}
        onPointerMove={(event) => {
          if (activePointersRef.current.has(event.pointerId)) trackPointer(event);
          const pinchStart = pinchStartRef.current;
          const pinchDistance = getPinchDistance();
          const pinchAngle = getPinchAngle();
          if (pinchStart && pinchDistance !== null && pinchAngle !== null) {
            event.preventDefault();
            const nextZoom = pinchStart.zoom + Math.log2(pinchDistance / pinchStart.distance) * 0.72;
            setMapZoom(Math.min(18, Math.max(10, nextZoom)));
            setManualRotation(pinchStart.rotation + pinchAngle - pinchStart.angle);
            return;
          }
          dragMap(event);
        }}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onWheel={(event) => {
          event.preventDefault();
          wheelDeltaRef.current += event.deltaY;
          if (Math.abs(wheelDeltaRef.current) < 160) return;
          const direction = wheelDeltaRef.current < 0 ? 1 : -1;
          wheelDeltaRef.current = 0;
          setMapZoom((value) => Math.min(18, Math.max(10, value + direction * 0.5)));
        }}
      >
        <div className="delivery-tracking-map__scene" style={{ transform: `scale(${scale})` }}>
          <div className="delivery-tracking-map__rotator" style={{ transform: `rotate(${mapRotation}deg)` }}>
            {tiles.map((tile) => (
              <span className="delivery-tracking-map__tile" key={tile.key} style={{ left: tile.x, top: tile.y, width: tile.size, height: tile.size }}>
                <img src={tile.url} alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
                {tile.overlayUrls.map((url) => (
                  <img className="delivery-tracking-map__tile-overlay" key={url} src={url} alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
                ))}
              </span>
            ))}
            <svg
              className="delivery-tracking-map__route"
              data-testid="delivery-road-route"
              viewBox={`0 0 ${mapSize} ${mapSize}`}
              aria-hidden="true"
            >
              <polyline
                points={projectedRoadRoute
                  .map((point) => `${point.x},${point.y}`)
                  .join(' ')}
              />
            </svg>
            <TrackingMarker point={restaurantPoint} kind="restaurant" icon={<Home />} onSelect={() => focusPoint('restaurant', restaurant)} />
            {driverPoint && driver && (
              <TrackingMarker
                point={driverPoint}
                kind="driver"
                heading={driverHeading}
                icon={<Navigation />}
                onSelect={() => focusPoint('driver', driver)}
              />
            )}
            <TrackingMarker point={clientPoint} kind="client" icon={<MapPin />} onSelect={() => focusPoint('client', client)} />
          </div>
          {selectedPoint && selectedPointPosition && (
            <article
              className="delivery-tracking-map__point-card"
              style={{
                left: Math.min(mapSize - 210, Math.max(12, selectedPointPosition.x + 14)),
                top: Math.min(mapSize - 126, Math.max(12, selectedPointPosition.y - 70))
              }}
            >
              <strong>
                {selectedPointKind === 'restaurant'
                  ? 'Ресторан'
                  : selectedPointKind === 'driver'
                    ? 'Водитель'
                    : 'Клиент'}
              </strong>
              <b>{selectedPoint.label}</b>
              {selectedPoint.address && <span>{selectedPoint.address}</span>}
              {selectedPoint.details?.map((detail) => <small key={detail}>{detail}</small>)}
            </article>
          )}
        </div>
        <div className="delivery-tracking-map__controls" aria-label="Управление картой" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => setMapZoom((value) => Math.min(18, value + 0.5))} aria-label="Приблизить"><Plus /></button>
          <button type="button" onClick={() => setMapZoom((value) => Math.max(10, value - 0.5))} aria-label="Отдалить"><Minus /></button>
          <button type="button" onClick={centerOnDriver} aria-label="Вернуть обзор и направление на водителя"><RotateCcw /></button>
          <button type="button" onClick={() => { setManualRotation(0); setCenter(defaultCenter); setMapZoom(defaultMapZoom); }} aria-label="Показать все точки"><LocateFixed /></button>
        </div>
        <div className="delivery-tracking-map__layers" aria-label="Слой карты" onPointerDown={(event) => event.stopPropagation()}>
          <Layers3 aria-hidden="true" />
          <button type="button" aria-pressed={mapStyle === 'street'} onClick={() => setMapStyle('street')}>Схема</button>
          <button type="button" aria-pressed={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')}>Спутник</button>
        </div>
      </div>
      <div className="delivery-tracking-map__legend">
        <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--restaurant" />{restaurant.label}</span>
        {driver && <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--driver" />{driver.label}</span>}
        <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--client" />{client.label}</span>
      </div>
      {roadRoute && (
        <strong className="delivery-tracking-map__route-summary">
          {formatRouteDistance(roadRoute.distanceM)} · {formatRouteDuration(roadRoute.durationS)}
        </strong>
      )}
      <small className="delivery-tracking-map__attribution">
        {mapStyle === 'satellite'
          ? '© Esri, Maxar, Earthstar Geographics, GIS User Community'
          : '© OpenStreetMap contributors'}
      </small>
    </section>
  );
}

function TrackingMarker({
  point,
  kind,
  heading = 0,
  icon,
  onSelect
}: {
  point: { x: number; y: number; label: string; address?: string };
  kind: 'restaurant' | 'driver' | 'client';
  heading?: number;
  icon: ReactNode;
  onSelect: () => void;
}) {
  const style = {
    left: point.x,
    top: point.y,
    '--driver-heading': `${heading}deg`
  } as CSSProperties;

  return (
    <button
      className={`delivery-tracking-map__marker delivery-tracking-map__marker--${kind}`}
      style={style}
      type="button"
      title={point.address || point.label}
      onClick={onSelect}
    >
      {icon}
    </button>
  );
}
