import {
  ArrowUp,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Home,
  Layers3,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  buildMapTileGrid,
  calculateBearing,
  coordinatesToMapPoint,
  getMapCenter,
  getMapZoomForPoints,
  getNavigationFollowCenter,
  getNavigationLookAheadDistanceM,
  getNearestEquivalentAngle,
  mapPointToCoordinates,
  rotateMapDelta,
  rotateMapPoint,
  type DeliveryMapCoordinates,
  type DeliveryMapStyle
} from './deliveryMap';
import { searchDeliveryLocations, type DeliveryLocationSearchResult } from './deliveryGeocoder';
import {
  getManeuverAnnouncementStage,
  getRemainingRoadRouteGeometry,
  getRoadRouteProgress,
  loadRoadRoute,
  type RoadRoute
} from './deliveryNavigation';
import './delivery-tracking-map.css';

type TrackingPoint = DeliveryMapCoordinates & {
  label: string;
  address?: string;
  details?: readonly string[];
};

type DeliveryTrackingMapProps = {
  restaurant?: TrackingPoint | null;
  client?: TrackingPoint | null;
  driver?: TrackingPoint | null;
  className?: string;
  initialStyle?: DeliveryMapStyle;
  routePoints?: ReadonlyArray<DeliveryMapCoordinates>;
  loadRoute?: (points: ReadonlyArray<DeliveryMapCoordinates>) => Promise<RoadRoute>;
  enableSearch?: boolean;
  searchLocations?: (query: string) => Promise<ReadonlyArray<DeliveryLocationSearchResult>>;
  followDriverHeading?: boolean;
  navigationMode?: boolean;
  onRouteSummaryChange?: (summary: DeliveryRouteSummary | null) => void;
};

export type DeliveryRouteSummary = Pick<RoadRoute, 'distanceM' | 'durationS'>;

const mapSize = 640;
const maximumInteractiveMapZoom = 20;
const driverFollowMapZoom = 16;
const defaultRouteLoader = (points: ReadonlyArray<DeliveryMapCoordinates>) => loadRoadRoute({ points });
const minimumDriverHeadingMoveM = 10;
const maximumOnRouteDistanceM = 15;
const offRouteReadingsBeforeReroute = 2;
const minimumRerouteIntervalMs = 12_000;
const formatRouteDistance = (distanceM: number) => `${new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}).format(distanceM / 1000)} км`;

const formatRouteDuration = (durationS: number) => `${Math.max(1, Math.round(durationS / 60))} мин`;
const formatManeuverDistance = (distanceM: number) => distanceM < 1_000
  ? `${Math.max(1, Math.round(distanceM))} м`
  : formatRouteDistance(distanceM);
const formatRoutePointKey = (points: ReadonlyArray<DeliveryMapCoordinates>) =>
  points.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join('|');
const getApproximateDistanceM = (first: DeliveryMapCoordinates, second: DeliveryMapCoordinates) => {
  const latM = (first.lat - second.lat) * 111_320;
  const lngM = (first.lng - second.lng) * 111_320 * Math.cos((((first.lat + second.lat) / 2) * Math.PI) / 180);
  return Math.hypot(latM, lngM);
};

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
  followDriverHeading = false,
  navigationMode = false,
  onRouteSummaryChange
}: DeliveryTrackingMapProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; center: DeliveryMapCoordinates; zoom: number; rotation: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; angle: number; zoom: number; rotation: number } | null>(null);
  const wheelDeltaRef = useRef(0);
  const routeRequestIdRef = useRef(0);
  const userAdjustedViewRef = useRef(false);
  const lastDriverHeadingPointRef = useRef<DeliveryMapCoordinates | null>(null);
  const lastResetViewKeyRef = useRef('');
  const latestRoutePointsRef = useRef<ReadonlyArray<DeliveryMapCoordinates>>([]);
  const spokenManeuverStagesRef = useRef<Set<string>>(new Set());
  const spokenRouteKeyRef = useRef('');
  const automaticRotationRef = useRef(0);
  const routeProgressRef = useRef<{ key: string; traveledDistanceM: number; updatedAt: number } | null>(null);
  const offRouteReadingsRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const mapZoomRef = useRef(0);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<DeliveryMapStyle>(initialStyle);
  const [loadedRoadRoute, setLoadedRoadRoute] = useState<RoadRoute | null>(null);
  const [selectedPointKind, setSelectedPointKind] = useState<'restaurant' | 'driver' | 'client' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReadonlyArray<DeliveryLocationSearchResult>>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [movementHeading, setMovementHeading] = useState<number | null>(null);
  const [audioGuidanceEnabled, setAudioGuidanceEnabled] = useState(false);
  const [routeRevision, setRouteRevision] = useState(0);
  const baseRoutePoints = useMemo(
    () => [restaurant, client].filter((point): point is TrackingPoint => Boolean(point)),
    [client, restaurant]
  );
  const resetViewKey = baseRoutePoints.length > 0
    ? formatRoutePointKey(baseRoutePoints)
    : driver
      ? 'driver-only'
      : 'empty';
  const routePointKey = (routePoints ?? baseRoutePoints)
    .map((point) => `${point.lat},${point.lng}`)
    .join('|');
  const requestedRoutePoints = routePoints ?? baseRoutePoints;
  const roadRouteDestinationKey = navigationMode && requestedRoutePoints.length >= 2
    ? formatRoutePointKey(requestedRoutePoints.slice(-1))
    : formatRoutePointKey(requestedRoutePoints);
  const roadRouteRequestKey = navigationMode
    ? `${roadRouteDestinationKey}:revision-${routeRevision}`
    : roadRouteDestinationKey;
  const effectiveRoutePoints = useMemo<ReadonlyArray<DeliveryMapCoordinates>>(
    () => routePointKey.split('|').filter(Boolean).map((pair) => {
      const [lat, lng] = pair.split(',').map(Number);
      return { lat, lng };
    }),
    [routePointKey]
  );
  latestRoutePointsRef.current = effectiveRoutePoints;
  const canAutomaticallyReroute = Boolean(
    navigationMode &&
    driver &&
    effectiveRoutePoints.length >= 2 &&
    getApproximateDistanceM(driver, effectiveRoutePoints[0]) <= 25
  );
  const mapAnchorPoints = useMemo(
    () => [
      ...(restaurant ? [{ lat: restaurant.lat, lng: restaurant.lng }] : []),
      ...(client ? [{ lat: client.lat, lng: client.lng }] : []),
      ...(driver ? [{ lat: driver.lat, lng: driver.lng }] : [])
    ],
    [client, driver, restaurant]
  );
  const defaultCenter = useMemo(() => getMapCenter(mapAnchorPoints), [mapAnchorPoints]);
  const defaultMapZoom = useMemo(() => getMapZoomForPoints(mapAnchorPoints), [mapAnchorPoints]);
  const [center, setCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultMapZoom);
  const [manualRotation, setManualRotation] = useState(0);
  mapZoomRef.current = mapZoom;

  const cancelZoomAnimation = () => {
    if (zoomAnimationFrameRef.current === null) return;
    window.cancelAnimationFrame(zoomAnimationFrameRef.current);
    zoomAnimationFrameRef.current = null;
  };

  const animateMapZoom = (targetZoom: number) => {
    cancelZoomAnimation();
    const startZoom = mapZoomRef.current;
    const startedAt = performance.now();
    const durationMs = 520;

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - ((1 - elapsed) ** 3);
      const nextZoom = startZoom + ((targetZoom - startZoom) * eased);
      mapZoomRef.current = nextZoom;
      setMapZoom(nextZoom);
      if (elapsed < 1) {
        zoomAnimationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        zoomAnimationFrameRef.current = null;
      }
    };

    zoomAnimationFrameRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelZoomAnimation(), []);
  useEffect(() => {
    if (lastResetViewKeyRef.current === resetViewKey) return;
    lastResetViewKeyRef.current = resetViewKey;
    setCenter(followDriverHeading && driver ? { lat: driver.lat, lng: driver.lng } : defaultCenter);
    setMapZoom(followDriverHeading && driver ? driverFollowMapZoom : defaultMapZoom);
    setSelectedPointKind(null);
    setManualRotation(0);
    userAdjustedViewRef.current = false;
  }, [defaultCenter, defaultMapZoom, driver, followDriverHeading, resetViewKey]);
  const tiles = useMemo(
    () => buildMapTileGrid({ center, zoom: mapZoom, mapSize, style: mapStyle }),
    [center, mapStyle, mapZoom]
  );
  const fallbackTiles = useMemo(
    () => buildMapTileGrid({
      center,
      zoom: mapZoom,
      mapSize,
      style: mapStyle,
      sourceZoom: Math.max(0, Math.floor(mapZoom) - 1)
    }),
    [center, mapStyle, mapZoom]
  );
  const restaurantPoint = useMemo(
    () => restaurant ? { ...restaurant, ...coordinatesToMapPoint(restaurant, center, mapZoom, mapSize, { clampToViewport: false }) } : null,
    [center, mapZoom, restaurant]
  );
  const clientPoint = useMemo(
    () => client ? { ...client, ...coordinatesToMapPoint(client, center, mapZoom, mapSize, { clampToViewport: false }) } : null,
    [center, mapZoom, client]
  );
  const routeProgress = useMemo(() => {
    if (!navigationMode || !loadedRoadRoute || !driver) return null;
    const previous = routeProgressRef.current?.key === roadRouteRequestKey
      ? routeProgressRef.current
      : null;
    const elapsedSeconds = previous ? Math.max(0, (Date.now() - previous.updatedAt) / 1_000) : 0;
    return getRoadRouteProgress({
      route: loadedRoadRoute,
      position: driver,
      minimumTraveledDistanceM: previous?.traveledDistanceM ?? 0,
      maximumTraveledDistanceM: previous
        ? previous.traveledDistanceM + Math.max(40, elapsedSeconds * 55)
        : loadedRoadRoute.distanceM,
      maximumSnapDistanceM: maximumOnRouteDistanceM
    });
  }, [driver, loadedRoadRoute, navigationMode, roadRouteRequestKey]);
  useEffect(() => {
    if (!routeProgress) return;
    routeProgressRef.current = {
      key: roadRouteRequestKey,
      traveledDistanceM: routeProgress.traveledDistanceM,
      updatedAt: Date.now()
    };
  }, [roadRouteRequestKey, routeProgress]);
  const roadRoute = useMemo<RoadRoute | null>(() => {
    if (!loadedRoadRoute || !routeProgress) return loadedRoadRoute;
    return {
      ...loadedRoadRoute,
      distanceM: routeProgress.remainingDistanceM,
      durationS: routeProgress.remainingDurationS,
      nextManeuver: routeProgress.nextManeuver
    };
  }, [loadedRoadRoute, routeProgress]);
  useEffect(() => {
    onRouteSummaryChange?.(roadRoute
      ? { distanceM: roadRoute.distanceM, durationS: roadRoute.durationS }
      : null);
  }, [onRouteSummaryChange, roadRoute]);
  const displayedDriver = useMemo(() => {
    if (!driver || !routeProgress?.isOnRoute) return driver;
    return { ...driver, ...routeProgress.snappedPosition };
  }, [driver, routeProgress]);
  const driverPoint = useMemo(
    () => displayedDriver
      ? { ...displayedDriver, ...coordinatesToMapPoint(displayedDriver, center, mapZoom, mapSize, { clampToViewport: false }) }
      : null,
    [center, displayedDriver, mapZoom]
  );
  const routeHeading = useMemo(() => {
    if (!driver) return 0;
    const routeTarget = effectiveRoutePoints.find((point) =>
      Math.abs(point.lat - driver.lat) > 0.000001 || Math.abs(point.lng - driver.lng) > 0.000001
    );
    if (routeTarget) return calculateBearing(driver, routeTarget);
    return client ? calculateBearing(driver, client) : 0;
  }, [client, driver, effectiveRoutePoints]);
  const driverHeading = movementHeading ?? routeProgress?.heading ?? routeHeading;
  const isDrivingAgainstRoute = movementHeading !== null && routeProgress !== null &&
    Math.abs(((movementHeading - routeProgress.heading + 540) % 360) - 180) >= 110;
  const automaticMapRotation = followDriverHeading && driver
    ? getNearestEquivalentAngle(automaticRotationRef.current, -driverHeading)
    : 0;
  automaticRotationRef.current = automaticMapRotation;
  const mapRotation = automaticMapRotation + manualRotation;
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
  const visibleRoadRouteGeometry = useMemo(() => {
    if (!loadedRoadRoute) return null;
    if (!navigationMode || !routeProgress?.isOnRoute) return loadedRoadRoute.geometry;
    return getRemainingRoadRouteGeometry(loadedRoadRoute, routeProgress.traveledDistanceM);
  }, [loadedRoadRoute, navigationMode, routeProgress]);
  const projectedRoadRoute = useMemo(
    () => visibleRoadRouteGeometry?.map((point) => coordinatesToMapPoint(point, center, mapZoom, mapSize, { clampToViewport: false })) ?? fallbackRoutePoints,
    [center, fallbackRoutePoints, mapZoom, visibleRoadRouteGeometry]
  );

  useEffect(() => {
    const configuredRoutePoints = latestRoutePointsRef.current;
    const currentRoutePoints = configuredRoutePoints;
    if (currentRoutePoints.length < 2) {
      setLoadedRoadRoute(null);
      return undefined;
    }

    let active = true;
    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    setLoadedRoadRoute(null);
    routeProgressRef.current = null;
    void loadRoute(currentRoutePoints)
      .then((route) => {
        if (active && requestId === routeRequestIdRef.current) setLoadedRoadRoute(route);
      })
      .catch(() => {
        if (active && requestId === routeRequestIdRef.current) setLoadedRoadRoute(null);
      });

    return () => {
      active = false;
    };
  }, [navigationMode, roadRouteRequestKey, loadRoute]);

  useEffect(() => {
    offRouteReadingsRef.current = 0;
  }, [roadRouteDestinationKey]);

  useEffect(() => {
    if (!canAutomaticallyReroute || !driver || !loadedRoadRoute || !routeProgress) return;
    if (routeProgress.isOnRoute && !isDrivingAgainstRoute) {
      offRouteReadingsRef.current = 0;
      return;
    }

    offRouteReadingsRef.current += 1;
    const now = Date.now();
    if (
      offRouteReadingsRef.current < offRouteReadingsBeforeReroute ||
      now - lastRerouteAtRef.current < minimumRerouteIntervalMs
    ) return;

    offRouteReadingsRef.current = 0;
    lastRerouteAtRef.current = now;
    routeProgressRef.current = null;
    spokenManeuverStagesRef.current.clear();
    setRouteRevision((revision) => revision + 1);
  }, [canAutomaticallyReroute, driver, isDrivingAgainstRoute, loadedRoadRoute, routeProgress]);

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
    if (!followDriverHeading || !displayedDriver || userAdjustedViewRef.current) return;
    const nextDriverPosition = { lat: displayedDriver.lat, lng: displayedDriver.lng };
    setCenter(getNavigationFollowCenter(
      nextDriverPosition,
      driverHeading,
      getNavigationLookAheadDistanceM(mapZoomRef.current)
    ));
    setMapZoom((zoom) => Math.max(16, zoom));
  }, [displayedDriver, driverHeading, followDriverHeading, mapZoom]);

  useEffect(() => {
    if (!driver) {
      lastDriverHeadingPointRef.current = null;
      setMovementHeading(null);
      return;
    }

    const nextPoint = { lat: driver.lat, lng: driver.lng };
    const previousPoint = lastDriverHeadingPointRef.current;
    if (!previousPoint) {
      lastDriverHeadingPointRef.current = nextPoint;
      return;
    }

    if (getApproximateDistanceM(previousPoint, nextPoint) < minimumDriverHeadingMoveM) return;
    setMovementHeading(calculateBearing(previousPoint, nextPoint));
    lastDriverHeadingPointRef.current = nextPoint;
  }, [driver]);

  useEffect(() => {
    if (!navigationMode || !audioGuidanceEnabled || !roadRoute?.nextManeuver) return undefined;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;

    const maneuver = roadRoute.nextManeuver;
    const announcementStage = getManeuverAnnouncementStage(maneuver.distanceM);
    if (!announcementStage) return undefined;
    if (spokenRouteKeyRef.current !== roadRouteRequestKey) {
      spokenRouteKeyRef.current = roadRouteRequestKey;
      spokenManeuverStagesRef.current.clear();
    }
    const maneuverDistanceFromStartM = (routeProgress?.traveledDistanceM ?? 0) + maneuver.distanceM;
    const maneuverKey = `${Math.round(maneuverDistanceFromStartM / 5) * 5}:${maneuver.instruction}:${maneuver.street ?? ''}`;
    const speechKey = `${maneuverKey}:${announcementStage}`;
    if (spokenManeuverStagesRef.current.has(speechKey)) return undefined;
    spokenManeuverStagesRef.current.add(speechKey);

    const distancePrefix = announcementStage === 'turn'
      ? ''
      : announcementStage === '50m'
        ? 'Через 50 метров. '
        : 'Через 300 метров. ';

    const utterance = new SpeechSynthesisUtterance(
      `${distancePrefix}${maneuver.instruction}.${maneuver.street ? ` ${maneuver.street}.` : ''}`
    );
    utterance.lang = 'ru-RU';
    utterance.rate = 0.95;
    utterance.pitch = 1.08;
    const russianVoices = window.speechSynthesis.getVoices().filter((voice) =>
      voice.lang.toLowerCase().startsWith('ru')
    );
    utterance.voice = russianVoices.find((voice) =>
      /female|alena|alyona|milena|irina|katya|елена|алёна|милена|ирина|google русский/i.test(voice.name)
    ) ?? russianVoices[0] ?? null;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return () => window.speechSynthesis.cancel();
  }, [audioGuidanceEnabled, navigationMode, roadRoute, roadRouteRequestKey, routeProgress]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    userAdjustedViewRef.current = true;
    setSelectedPointKind(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: event.clientX, y: event.clientY, center, zoom: mapZoom, rotation: mapRotation };
    setIsDragging(true);
  };

  const dragMap = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = (event.clientX - start.x) / scale;
    const dy = (event.clientY - start.y) / scale;
    const mapDelta = rotateMapDelta({ x: dx, y: dy }, -start.rotation);
    setCenter(mapPointToCoordinates({ x: mapSize / 2 - mapDelta.x, y: mapSize / 2 - mapDelta.y }, start.center, start.zoom, mapSize));
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
      ? { x: remaining.x, y: remaining.y, center, zoom: mapZoom, rotation: mapRotation }
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
    userAdjustedViewRef.current = true;
    setCenter({ lat: result.lat, lng: result.lng });
    setMapZoom(16);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearchMessage('');
  };

  const focusPoint = (kind: 'restaurant' | 'driver' | 'client', point: TrackingPoint) => {
    if (selectedPointKind === kind) {
      setSelectedPointKind(null);
      return;
    }
    userAdjustedViewRef.current = true;
    setSelectedPointKind(kind);
    setCenter({ lat: point.lat, lng: point.lng });
    setMapZoom((zoom) => Math.min(17, Math.max(15, zoom + 0.55)));
  };

  const centerOnDriver = () => {
    userAdjustedViewRef.current = false;
    setManualRotation((currentManualRotation) =>
      getNearestEquivalentAngle(
        automaticMapRotation + currentManualRotation,
        automaticMapRotation
      ) - automaticMapRotation
    );
    if (displayedDriver) {
      const driverPosition = { lat: displayedDriver.lat, lng: displayedDriver.lng };
      setCenter(getNavigationFollowCenter(
        driverPosition,
        driverHeading,
        getNavigationLookAheadDistanceM(driverFollowMapZoom)
      ));
      animateMapZoom(driverFollowMapZoom);
      return;
    }
    setCenter(defaultCenter);
    animateMapZoom(defaultMapZoom);
  };

  const alignMapToCompass = () => {
    userAdjustedViewRef.current = true;
    setManualRotation((currentManualRotation) =>
      getNearestEquivalentAngle(
        automaticMapRotation + currentManualRotation,
        0
      ) - automaticMapRotation
    );
  };

  const toggleAudioGuidance = () => {
    setAudioGuidanceEnabled((enabled) => {
      if (enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      if (enabled) {
        spokenManeuverStagesRef.current.clear();
        spokenRouteKeyRef.current = '';
      }
      return !enabled;
    });
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
        data-map-zoom={mapZoom.toFixed(3)}
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
              userAdjustedViewRef.current = true;
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
            setMapZoom(Math.min(maximumInteractiveMapZoom, Math.max(10, nextZoom)));
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
          setMapZoom((value) => Math.min(maximumInteractiveMapZoom, Math.max(10, value + direction * 0.5)));
        }}
      >
        <div className="delivery-tracking-map__scene" style={{ transform: `scale(${scale})` }}>
          <div className="delivery-tracking-map__rotator" style={{ transform: `rotate(${mapRotation}deg)` }}>
            {fallbackTiles.map((tile) => (
              <span className="delivery-tracking-map__tile delivery-tracking-map__tile--fallback" key={`fallback-${tile.key}`} style={{ left: tile.x, top: tile.y, width: tile.size, height: tile.size }}>
                <img src={tile.url} alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
                {tile.overlayUrls.map((url) => (
                  <img className="delivery-tracking-map__tile-overlay" key={url} src={url} alt="" aria-hidden="true" draggable={false} loading="eager" decoding="async" />
                ))}
              </span>
            ))}
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
              overflow="visible"
              aria-hidden="true"
            >
              <polyline
                points={projectedRoadRoute
                  .map((point) => `${point.x},${point.y}`)
                  .join(' ')}
              />
            </svg>
            {restaurantPoint && restaurant && (
              <TrackingMarker
                point={restaurantPoint}
                kind="restaurant"
                mapRotation={mapRotation}
                icon={<Home />}
                onSelect={() => focusPoint('restaurant', restaurant)}
              />
            )}
            {driverPoint && driver && (
              <TrackingMarker
                point={driverPoint}
                kind="driver"
                heading={driverHeading}
                icon={<DriverArrowIcon />}
                onSelect={() => focusPoint('driver', driver)}
              />
            )}
            {clientPoint && client && (
              <TrackingMarker
                point={clientPoint}
                kind="client"
                mapRotation={mapRotation}
                icon={<MapPin />}
                onSelect={() => focusPoint('client', client)}
              />
            )}
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
          {navigationMode && (
            <button
              type="button"
              onClick={() => setMapStyle((style) => style === 'satellite' ? 'street' : 'satellite')}
              aria-label={mapStyle === 'satellite' ? 'Переключить на схему' : 'Переключить на спутник'}
            ><Layers3 /></button>
          )}
          <button type="button" onClick={() => { cancelZoomAnimation(); setMapZoom((value) => Math.min(maximumInteractiveMapZoom, value + 0.5)); }} aria-label="Приблизить"><Plus /></button>
          <button type="button" onClick={() => { cancelZoomAnimation(); setMapZoom((value) => Math.max(10, value - 0.5)); }} aria-label="Отдалить"><Minus /></button>
          {navigationMode && (
            <button
              type="button"
              onClick={toggleAudioGuidance}
              aria-label={audioGuidanceEnabled ? 'Выключить голосовые подсказки' : 'Включить голосовые подсказки'}
              aria-pressed={audioGuidanceEnabled}
            >
              {audioGuidanceEnabled ? <Volume2 /> : <VolumeX />}
            </button>
          )}
          {!navigationMode && (
            <>
              <button type="button" onClick={centerOnDriver} aria-label="Определить местоположение" title="Определить местоположение"><Navigation /></button>
              <button type="button" onClick={() => { userAdjustedViewRef.current = true; setManualRotation(0); setCenter(defaultCenter); setMapZoom(defaultMapZoom); }} aria-label="Показать все точки"><LocateFixed /></button>
            </>
          )}
        </div>
        {navigationMode && (
          <div className="delivery-tracking-map__navigation-bottom-controls" aria-label="Ориентация карты" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={alignMapToCompass} aria-label="Выровнять карту по компасу"><Compass /></button>
            <button type="button" onClick={centerOnDriver} aria-label="Следить за водителем"><Navigation /></button>
          </div>
        )}
        {!navigationMode && (
          <div className="delivery-tracking-map__layers" aria-label="Слой карты" onPointerDown={(event) => event.stopPropagation()}>
            <Layers3 aria-hidden="true" />
            <button type="button" aria-pressed={mapStyle === 'street'} onClick={() => setMapStyle('street')}>Схема</button>
            <button type="button" aria-pressed={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')}>Спутник</button>
          </div>
        )}
        {roadRoute && (
          <aside className="delivery-tracking-map__navigation" aria-label="Следующая подсказка маршрута">
            <ManeuverIcon instruction={roadRoute.nextManeuver?.instruction} />
            {navigationMode ? (
              <>
                <small>
                  {roadRoute.nextManeuver
                    ? formatManeuverDistance(roadRoute.nextManeuver.distanceM)
                    : 'Далее'}
                </small>
                <em>{roadRoute.nextManeuver?.street ?? 'Продолжайте по маршруту'}</em>
              </>
            ) : (
              <span>
                <small>
                  {roadRoute.nextManeuver
                    ? `Через ${formatManeuverDistance(roadRoute.nextManeuver.distanceM)}`
                    : 'До следующей точки'}
                </small>
                <strong>{roadRoute.nextManeuver?.instruction ?? 'Продолжайте по маршруту'}</strong>
              </span>
            )}
            {!navigationMode && (
              <b>{formatRouteDistance(roadRoute.distanceM)}<small>{formatRouteDuration(roadRoute.durationS)}</small></b>
            )}
          </aside>
        )}
        <small className="delivery-tracking-map__attribution">
          {mapStyle === 'satellite'
            ? '© Esri, Maxar, Earthstar Geographics, GIS User Community'
            : '© OpenStreetMap contributors'}
        </small>
      </div>
      {!navigationMode && (
        <div className="delivery-tracking-map__legend">
          {restaurant && <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--restaurant" />{restaurant.label}</span>}
          {driver && <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--driver" />{driver.label}</span>}
          {client && <span><i className="delivery-tracking-map__dot delivery-tracking-map__dot--client" />{client.label}</span>}
        </div>
      )}
    </section>
  );
}

function ManeuverIcon({ instruction = '' }: { instruction?: string }) {
  if (/направо|правее/i.test(instruction)) {
    return <CornerUpRight role="img" aria-label="Поворот направо" />;
  }
  if (/налево|левее/i.test(instruction)) {
    return <CornerUpLeft role="img" aria-label="Поворот налево" />;
  }
  if (/развернитесь/i.test(instruction)) {
    return <RotateCcw role="img" aria-label="Разворот" />;
  }
  return <ArrowUp role="img" aria-label="Продолжайте прямо" />;
}

function DriverArrowIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        className="delivery-tracking-map__driver-arrow-shadow"
        d="M32 5 53 57 32 46 11 57 32 5Z"
      />
      <path
        className="delivery-tracking-map__driver-arrow"
        d="M32 5 53 57 32 46 11 57 32 5Z"
      />
      <path
        className="delivery-tracking-map__driver-arrow-highlight"
        d="M32 13 43 45 32 39 21 45 32 13Z"
      />
    </svg>
  );
}

function TrackingMarker({
  point,
  kind,
  heading = 0,
  mapRotation = 0,
  icon,
  onSelect
}: {
  point: { x: number; y: number; label: string; address?: string };
  kind: 'restaurant' | 'driver' | 'client';
  heading?: number;
  mapRotation?: number;
  icon: ReactNode;
  onSelect: () => void;
}) {
  const style = {
    left: point.x,
    top: point.y,
    '--driver-heading': `${heading}deg`,
    '--map-counter-rotation': `${-mapRotation}deg`
  } as CSSProperties;

  return (
    <button
      className={`delivery-tracking-map__marker delivery-tracking-map__marker--${kind}`}
      style={style}
      type="button"
      title={point.address || point.label}
      aria-label={`${kind === 'restaurant' ? 'Ресторан' : kind === 'driver' ? 'Водитель' : 'Клиент'}: ${point.label}`}
      onClick={onSelect}
    >
      {icon}
      {kind !== 'driver' && (
        <span className="delivery-tracking-map__marker-label">
          <strong>{kind === 'restaurant' ? point.label : 'Клиент'}</strong>
          <small>{kind === 'restaurant' ? 'Ресторан' : point.label}</small>
        </span>
      )}
    </button>
  );
}
