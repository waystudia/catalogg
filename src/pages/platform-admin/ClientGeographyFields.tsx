import { MapPin } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { PlatformDeliverySettlement } from '../../shared/api/platformTypes';
import {
  getDeliveryCityOptions,
  getDeliverySettlementOptions,
  keepSettlementsAvailableForCity
} from '../../shared/deliveryGeography';

export function ClientGeographyFields({
  settlements,
  primaryCity,
  selectedSettlements,
  onPrimaryCityChange,
  onSelectedSettlementsChange
}: {
  settlements: readonly PlatformDeliverySettlement[];
  primaryCity: string;
  selectedSettlements: readonly string[];
  onPrimaryCityChange: (city: string) => void;
  onSelectedSettlementsChange: (settlements: string[]) => void;
}) {
  const cityOptions = useMemo(() => getDeliveryCityOptions(settlements), [settlements]);
  const settlementOptions = useMemo(
    () => getDeliverySettlementOptions(settlements, primaryCity),
    [primaryCity, settlements]
  );

  useEffect(() => {
    if (!primaryCity || settlements.length === 0) return;
    const compatible = keepSettlementsAvailableForCity(
      selectedSettlements,
      settlements,
      primaryCity
    );
    if (
      compatible.length !== selectedSettlements.length ||
      compatible.some((settlement, index) => settlement !== selectedSettlements[index])
    ) {
      onSelectedSettlementsChange(compatible);
    }
  }, [onSelectedSettlementsChange, primaryCity, selectedSettlements, settlements]);

  const changeCity = (city: string) => {
    onPrimaryCityChange(city);
    onSelectedSettlementsChange(
      keepSettlementsAvailableForCity(selectedSettlements, settlements, city)
    );
  };

  const toggleSettlement = (settlement: string) => {
    onSelectedSettlementsChange(
      selectedSettlements.includes(settlement)
        ? selectedSettlements.filter((value) => value !== settlement)
        : [...selectedSettlements, settlement]
    );
  };

  return (
    <div className="client-geography-fields">
      <label>
        Основной город
        <select value={primaryCity} onChange={(event) => changeCity(event.target.value)}>
          <option value="">Выберите город</option>
          {primaryCity && !cityOptions.includes(primaryCity) && (
            <option value={primaryCity}>{primaryCity}</option>
          )}
          {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
        </select>
        {primaryCity && (
          <span className="client-geography-point">
            <MapPin aria-hidden="true" />
            <small>Точка ресторана: <strong>{primaryCity}</strong></small>
          </span>
        )}
      </label>

      <fieldset className="client-geography-settlements">
        <legend>Сёла и районы обслуживания</legend>
        <div className="client-geography-settlements__list">
          {settlementOptions.map((settlement) => (
            <label key={settlement}>
              <input
                type="checkbox"
                checked={selectedSettlements.includes(settlement)}
                onChange={() => toggleSettlement(settlement)}
              />
              <span>{settlement}</span>
            </label>
          ))}
          {!primaryCity && <p>Сначала выберите основной город.</p>}
          {primaryCity && settlementOptions.length === 0 && (
            <p>Для этого города населённые пункты ещё не добавлены в географию.</p>
          )}
        </div>
        {selectedSettlements.length > 0 && (
          <small>Выбрано: {selectedSettlements.join(', ')}</small>
        )}
      </fieldset>
    </div>
  );
}
