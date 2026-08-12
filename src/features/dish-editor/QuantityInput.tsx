import { useEffect, useState } from 'react';
import { getBusinessTerms, type BusinessType } from '../../shared/businessTerminology';
import type { CatalogSaleUnit } from '../../entities/models';

function NumericInput({
  value,
  step,
  disabled = false,
  onChange
}: {
  value: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(String(value));
    }
  }, [focused, value]);

  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      min={0}
      step={step}
      type="number"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text.trim() === '') {
          setText('0');
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(next.trim() === '' ? 0 : Number(next));
      }}
    />
  );
}

export function QuantityInput({
  weight,
  dailyQuantity,
  unlimitedQuantity,
  onWeightChange,
  onQuantityChange,
  onUnlimitedChange,
  businessType = 'restaurant',
  saleUnit = 'piece'
}: {
  weight: number;
  dailyQuantity: number;
  unlimitedQuantity: boolean;
  onWeightChange: (weight: number) => void;
  onQuantityChange: (quantity: number) => void;
  onUnlimitedChange: (unlimited: boolean) => void;
  businessType?: BusinessType;
  saleUnit?: CatalogSaleUnit;
}) {
  const terms = getBusinessTerms(businessType);
  const isWeightedGrocery = businessType === 'grocery' && saleUnit === 'weight';
  return (
    <section className="dish-section">
      <h3>Параметры</h3>
      <div className="dish-two-fields">
        {!isWeightedGrocery && (
          <label>
            Вес
            <span>
              <NumericInput value={weight} onChange={onWeightChange} />
              г
            </span>
          </label>
        )}
        <label>
          {isWeightedGrocery ? 'Остаток, кг' : 'Остаток на сегодня'}
          <span>
            <NumericInput
              value={dailyQuantity}
              step={isWeightedGrocery ? 0.01 : 1}
              disabled={unlimitedQuantity}
              onChange={onQuantityChange}
            />
            {isWeightedGrocery ? 'кг' : 'шт'}
          </span>
        </label>
      </div>
      <label className="dish-unlimited-toggle">
        <input
          type="checkbox"
          checked={unlimitedQuantity}
          onChange={(event) => onUnlimitedChange(event.target.checked)}
        />
        <span>
          <strong>Без ограничений</strong>
          <small>{terms.item} всегда доступно для заказа</small>
        </span>
      </label>
      {!unlimitedQuantity && dailyQuantity === 0 && <p className="dish-stock-warning">Закончилось</p>}
    </section>
  );
}
