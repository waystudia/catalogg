import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, Layers3, LocateFixed, MapPin, Minus, Plus, Search } from 'lucide-react';
import {
  buildMapTileGrid,
  mapPointToCoordinates,
  type DeliveryMapCoordinates,
  type DeliveryMapPoint,
  type DeliveryMapStyle
} from './deliveryMap';
import {
  searchDeliveryLocations,
  type DeliveryLocationSearchResult
} from './deliveryGeocoder';

const mapSize = 320;
const initialMapZoom = 16;

type DeliveryMapPickerProps = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  isLocating?: boolean;
  error?: string;
  onLocate: () => void;
  onChange: (coordinates: DeliveryMapCoordinates) => void;
  onDone?: () => void;
  onSearchSelect?: (result: DeliveryLocationSearchResult) => void;
  searchLocations?: (query: string) => Promise<ReadonlyArray<DeliveryLocationSearchResult>>;
};

type MapDragStart = {
  readonly x: number;
  readonly y: number;
  readonly center: DeliveryMapCoordinates;
  readonly zoom: number;
  readonly moved: boolean;
};

export function DeliveryMapPicker({
  lat,
  lng,
  accuracyM,
  isLocating = false,
  error = '',
  onLocate,
  onChange,
  onDone,
  onSearchSelect,
  searchLocations = searchDeliveryLocations
}: DeliveryMapPickerProps) {
  const initialCoordinates = { lat, lng };
  const [selectedCoordinates, setSelectedCoordinates] = useState<DeliveryMapCoordinates>(initialCoordinates);
  const [center, setCenter] = useState<DeliveryMapCoordinates>(initialCoordinates);
  const [mapZoom, setMapZoom] = useState(initialMapZoom);
  const [mapStyle, setMapStyle] = useState<DeliveryMapStyle>('street');
  const [isDragging, setIsDragging] = useState(false);
  const [isManualSelection, setIsManualSelection] = useState(accuracyM === null || accuracyM === undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReadonlyArray<DeliveryLocationSearchResult>>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const shouldRecenterRef = useRef(true);
  const centerRef = useRef(center);
  const dragStartRef = useRef<MapDragStart | null>(null);
  const tiles = useMemo(
    () => buildMapTileGrid({ center, zoom: mapZoom, mapSize, style: mapStyle }),
    [center, mapStyle, mapZoom]
  );

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    const coordinates = { lat, lng };
    setSelectedCoordinates(coordinates);
    if (shouldRecenterRef.current) setCenter(coordinates);
    if (accuracyM !== null && accuracyM !== undefined) setIsManualSelection(false);
  }, [accuracyM, lat, lng]);

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>): DeliveryMapPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * mapSize,
      y: ((event.clientY - rect.top) / rect.height) * mapSize
    };
  };

  const selectManualCoordinates = (coordinates: DeliveryMapCoordinates) => {
    shouldRecenterRef.current = false;
    centerRef.current = coordinates;
    setCenter(coordinates);
    setSelectedCoordinates(coordinates);
    setIsManualSelection(true);
    onChange(coordinates);
  };

  const finishMapPointer = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    dragStartRef.current = null;
    setIsDragging(false);

    if (dragStart.moved) {
      selectManualCoordinates(centerRef.current);
      return;
    }

    const coordinates = mapPointToCoordinates(pointFromEvent(event), centerRef.current, mapZoom, mapSize);
    selectManualCoordinates(coordinates);
  };

  const locate = () => {
    shouldRecenterRef.current = true;
    setIsManualSelection(false);
    onLocate();
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
      if (results.length === 0) {
        setSearchMessage('В Чеченской Республике ничего не найдено.');
      }
    } catch (searchError) {
      setSearchMessage(searchError instanceof Error ? searchError.message : 'Не удалось выполнить поиск на карте.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result: DeliveryLocationSearchResult) => {
    const coordinates = { lat: result.lat, lng: result.lng };
    selectManualCoordinates(coordinates);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearchMessage('');
    onSearchSelect?.(result);
  };

  return (
    <section className="delivery-map-picker" aria-label="Карта доставки">
      <form
        className="delivery-map-picker__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void submitSearch();
        }}
      >
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label="Село, город или улица в Чечне"
          placeholder="Село, город или улица"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button type="submit" aria-label="Найти на карте" disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? 'Ищем...' : 'Найти'}
        </button>
      </form>

      {(searchResults.length > 0 || searchMessage) && (
        <div className="delivery-map-picker__search-results" aria-live="polite">
          {searchResults.map((result) => (
            <button type="button" key={result.id} onClick={() => selectSearchResult(result)}>
              <MapPin aria-hidden="true" />
              <span>{result.label}</span>
            </button>
          ))}
          {searchMessage && <p>{searchMessage}</p>}
        </div>
      )}

      <div
        className={isDragging ? 'delivery-map-picker__canvas is-dragging' : 'delivery-map-picker__canvas'}
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            center: centerRef.current,
            zoom: mapZoom,
            moved: false
          };
          setIsDragging(true);
        }}
        onPointerMove={(event) => {
          const dragStart = dragStartRef.current;
          if (!dragStart) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = ((event.clientX - dragStart.x) / rect.width) * mapSize;
          const dy = ((event.clientY - dragStart.y) / rect.height) * mapSize;
          const moved = dragStart.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
          dragStartRef.current = { ...dragStart, moved };
          if (!moved) return;
          const nextCenter = mapPointToCoordinates(
            { x: mapSize / 2 - dx, y: mapSize / 2 - dy },
            dragStart.center,
            dragStart.zoom,
            mapSize
          );
          centerRef.current = nextCenter;
          setCenter(nextCenter);
        }}
        onPointerUp={finishMapPointer}
        onPointerCancel={() => {
          dragStartRef.current = null;
          setIsDragging(false);
        }}
      >
        {tiles.map((tile) => (
          <span className="delivery-map-picker__tile" key={tile.key} style={{ left: tile.x, top: tile.y }}>
            <img alt="" aria-hidden="true" draggable={false} src={tile.url} />
            {tile.overlayUrls.map((url) => (
              <img className="delivery-map-picker__tile-overlay" alt="" aria-hidden="true" draggable={false} key={url} src={url} />
            ))}
          </span>
        ))}
        <span className="delivery-map-picker__marker" style={{ left: mapSize / 2, top: mapSize / 2 }}>
          <MapPin />
        </span>
        <div className="delivery-map-picker__layers" aria-label="Слой карты" onPointerDown={(event) => event.stopPropagation()}>
          <Layers3 aria-hidden="true" />
          <button type="button" aria-pressed={mapStyle === 'street'} onClick={() => setMapStyle('street')}>Схема</button>
          <button type="button" aria-pressed={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')}>Спутник</button>
        </div>
        <div className="delivery-map-picker__zoom" aria-label="Масштаб карты" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" aria-label="Приблизить карту" onClick={() => setMapZoom((zoom) => Math.min(18, zoom + 1))}><Plus /></button>
          <button type="button" aria-label="Отдалить карту" onClick={() => setMapZoom((zoom) => Math.max(10, zoom - 1))}><Minus /></button>
        </div>
        <small className="delivery-map-picker__attribution">
          {mapStyle === 'satellite'
            ? '© Esri, Maxar, Earthstar Geographics · © OpenStreetMap contributors'
            : '© OpenStreetMap contributors'}
        </small>
      </div>

      <div className="delivery-map-picker__meta">
        <strong>{selectedCoordinates.lat.toFixed(7)}, {selectedCoordinates.lng.toFixed(7)}</strong>
        <small>
          {!isManualSelection && accuracyM !== null && accuracyM !== undefined
            ? `точность ${accuracyM} м`
            : 'точка выбрана вручную'}
        </small>
        {error && <p>{error}</p>}
      </div>

      <div className="delivery-map-picker__actions">
        <button type="button" onClick={locate} disabled={isLocating}>
          <LocateFixed />
          {isLocating ? 'Отслеживаем...' : 'Отследить моё местоположение'}
        </button>
        {onDone && (
          <button type="button" onClick={onDone}>
            <Check />
            Готово
          </button>
        )}
      </div>
    </section>
  );
}
