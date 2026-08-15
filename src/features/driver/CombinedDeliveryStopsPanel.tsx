import { Check, Clock3, MapPin, Navigation, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildYandexMapsRouteAppUrl } from '../order/orderLifecycle';
import { updateCurrentDriverDeliveryStop, type DeliveryOffer } from '../../shared/api/deliveryApi';
import { getBusinessTerms } from '../../shared/businessTerminology';
import {
  getActiveDeliveryStop,
  getDeliveryStopAction,
  getVisibleDeliveryStops
} from './combinedDeliveryStops';

const statusLabel = {
  pending: 'Следующая точка',
  arrived: 'Вы на месте',
  completed: 'Выполнено',
  skipped: 'Пропущено',
  cancelled: 'Отменено'
} as const;

const readyLabel = (readyAt: string | null) => {
  if (!readyAt) return '';
  const timestamp = Date.parse(readyAt);
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.ceil((timestamp - Date.now()) / 60_000);
  return minutes > 0 ? `Будет готово через ${minutes} мин` : 'Должно быть готово';
};

export function CombinedDeliveryStopsPanel({
  offer,
  onRefresh,
  compact = false
}: {
  offer: DeliveryOffer;
  onRefresh: () => Promise<boolean>;
  compact?: boolean;
}) {
  const stops = useMemo(() => getVisibleDeliveryStops(offer.stops), [offer.stops]);
  const activeStop = useMemo(() => getActiveDeliveryStop(stops), [stops]);
  const [updatingStopId, setUpdatingStopId] = useState('');
  const [error, setError] = useState('');

  if (!offer.isCombined || stops.length === 0) return null;

  const updateStop = async (stopId: string, nextStatus: 'arrived' | 'completed') => {
    if (updatingStopId) return;
    setUpdatingStopId(stopId);
    setError('');
    try {
      await updateCurrentDriverDeliveryStop(offer.deliveryId, stopId, nextStatus);
      await onRefresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить точку маршрута.');
    } finally {
      setUpdatingStopId('');
    }
  };

  return (
    <section className="driver-combined-stops" data-compact={compact} aria-label="Точки объединённой доставки">
      <header>
        <span>
          <strong>Одна доставка · {stops.length} точки</strong>
          <small>Заберите заказы по порядку и привезите вместе</small>
        </span>
      </header>
      <ol>
        {stops.map((stop) => {
          const action = getDeliveryStopAction(stop, activeStop?.id ?? null);
          const isPrimaryQrBlocked = Boolean(
            stop.isPrimary && stop.status === 'arrived' && !offer.pickupQrConfirmed
          );
          const routeUrl = buildYandexMapsRouteAppUrl({
            to: { lat: stop.latitude, lng: stop.longitude, address: stop.address }
          });
          const terms = getBusinessTerms(stop.merchantType);
          const preparation = readyLabel(stop.estimatedReadyAt);
          const title = stop.stopType === 'dropoff'
            ? 'Клиент'
            : stop.merchantName || terms.place;

          return (
            <li
              key={stop.id}
              data-active={stop.id === activeStop?.id}
              data-complete={stop.status === 'completed'}
              data-cancelled={stop.status === 'cancelled' || stop.status === 'skipped'}
            >
              <span className="driver-combined-stops__number">
                {stop.status === 'completed' ? <Check aria-hidden="true" /> : stop.sequence}
              </span>
              <div>
                <small>{stop.stopType === 'dropoff' ? 'Доставить' : 'Забрать'} · {statusLabel[stop.status]}</small>
                <strong>{title}</strong>
                <span>{stop.address}</span>
                {preparation && <em><Clock3 aria-hidden="true" />{preparation}</em>}
                {stop.merchantOrderStatus === 'ready' && <em><PackageCheck aria-hidden="true" />Готов к выдаче</em>}
                {stop.id === activeStop?.id && (
                  <div className="driver-combined-stops__actions">
                    <a href={routeUrl} target="_blank" rel="noreferrer">
                      <Navigation aria-hidden="true" />Маршрут
                    </a>
                    {action && (
                      <button
                        type="button"
                        disabled={Boolean(updatingStopId) || isPrimaryQrBlocked}
                        onClick={() => void updateStop(stop.id, action.nextStatus)}
                      >
                        <MapPin aria-hidden="true" />
                        {updatingStopId === stop.id
                          ? 'Сохраняем…'
                          : isPrimaryQrBlocked
                            ? 'Сначала QR'
                            : action.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="driver-error" role="alert">{error}</p>}
    </section>
  );
}
