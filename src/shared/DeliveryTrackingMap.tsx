import { Home, Layers3, LocateFixed, MapPin, Minus, Navigation, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import {
  buildMapTileGrid,
  coordinatesToMapPoint,
  getMapCenter,
  getMapZoomForPoints,
  mapPointToCoordinates,
  type DeliveryMapCoordinates,
  type DeliveryMapStyle
} from './deliveryMap';
import { loadRoadRoute, type RoadRoute } from './deliveryNavigation';
import './delivery-tracking-map.css';

type TrackingPoint = DeliveryMapCoordinates & {
  label: string;
  address?: string;
};

type DeliveryTrackingMapProps = {
  restaurant: TrackingPoint;
  client: TrackingPoint;
  driver?: TrackingPoint | null;
  className?: string;
  initialStyle?: DeliveryMapStyle;
  routePoints?: ReadonlyArray<DeliveryMapCoordinates>;
  loadRoute?: (points: ReadonlyArray<DeliveryMapCoordinates>) => Promise<RoadRoute>;
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
  loadRoute = defaultRouteLoader
}: DeliveryTrackingMapProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; center: DeliveryMapCoordinates; zoom: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<DeliveryMapStyle>(initialStyle);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const points = useMemo(() => [restaurant, client, ...(driver ? [driver] : [])], [client, driver, restaurant]);
  const effectiveRoutePoints = useMemo(
    () => routePoints ?? [restaurant, client],
    [client, restaurant, routePoints]
  );
  const routeKey = effectiveRoutePoints.map((point) => `${point.lat},${point.lng}`).join(';');
  const defaultCenter = useMemo(() => getMapCenter(points), [points]);
  const defaultMapZoom = useMemo(() => getMapZoomForPoints(points), [points]);
  const [center, setCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultMapZoom);
  useEffect(() => {
    setCenter(defaultCenter);
    setMapZoom(defaultMapZoom);
  }, [defaultCenter, defaultMapZoom]);
  const tiles = useMemo(
    () => buildMapTileGrid({ center, zoom: mapZoom, mapSize, style: mapStyle }),
    [center, mapStyle, mapZoom]
  );
  const projectedPoints = useMemo(
    () => points.map((point) => ({ ...point, ...coordinatesToMapPoint(point, center, mapZoom, mapSize) })),
    [center, mapZoom, points]
  );
  const restaurantPoint = projectedPoints[0];
  const clientPoint = projectedPoints[1];
  const driverPoint = driver ? projectedPoints[2] : null;
  const fallbackRoutePoints = useMemo(
    () => effectiveRoutePoints.map((point) => coordinatesToMapPoint(point, center, mapZoom, mapSize)),
    [center, effectiveRoutePoints, mapZoom]
  );
  const projectedRoadRoute = useMemo(
    () => roadRoute?.geometry.map((point) => coordinatesToMapPoint(point, center, mapZoom, mapSize)) ?? fallbackRoutePoints,
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
  }, [effectiveRoutePoints, loadRoute, routeKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const updateScale = () => setScale(Math.min(1, canvas.clientWidth / mapSize));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

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
    setIsDragging(false);
  };

  return (
    <section className={`delivery-tracking-map ${className}`.trim()} aria-label="Карта доставки">
      <div
        className={isDragging ? 'delivery-tracking-map__canvas is-dragging' : 'delivery-tracking-map__canvas'}
        ref={canvasRef}
        onPointerDown={startDrag}
        onPointerMove={dragMap}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(event) => {
          event.preventDefault();
          setMapZoom((value) => Math.min(18, Math.max(10, value + (event.deltaY < 0 ? 1 : -1))));
        }}
      >
        <div className="delivery-tracking-map__scene" style={{ transform: `scale(${scale})` }}>
          {tiles.map((tile) => (
            <span className="delivery-tracking-map__tile" key={tile.key} style={{ left: tile.x, top: tile.y }}>
              <img src={tile.url} alt="" aria-hidden="true" draggable={false} />
              {tile.overlayUrls.map((url) => (
                <img className="delivery-tracking-map__tile-overlay" key={url} src={url} alt="" aria-hidden="true" draggable={false} />
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
          <TrackingMarker point={restaurantPoint} kind="restaurant" icon={<Home />} />
          {driverPoint && <TrackingMarker point={driverPoint} kind="driver" icon={<Navigation />} />}
          <TrackingMarker point={clientPoint} kind="client" icon={<MapPin />} />
        </div>
        <div className="delivery-tracking-map__controls" aria-label="Управление картой" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => setMapZoom((value) => Math.min(18, value + 1))} aria-label="Приблизить"><Plus /></button>
          <button type="button" onClick={() => setMapZoom((value) => Math.max(10, value - 1))} aria-label="Отдалить"><Minus /></button>
          <button type="button" onClick={() => { setCenter(defaultCenter); setMapZoom(defaultMapZoom); }} aria-label="Показать все точки"><LocateFixed /></button>
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
  icon
}: {
  point: { x: number; y: number; label: string; address?: string };
  kind: 'restaurant' | 'driver' | 'client';
  icon: ReactNode;
}) {
  return (
    <span className={`delivery-tracking-map__marker delivery-tracking-map__marker--${kind}`} style={{ left: point.x, top: point.y }} title={point.address || point.label}>
      {icon}
    </span>
  );
}
