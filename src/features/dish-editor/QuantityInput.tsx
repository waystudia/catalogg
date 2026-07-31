import { useEffect, useState } from 'react';
import { getBusinessTerms, type BusinessType } from '../../shared/businessTerminology';

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
  businessType = 'restaurant'
}: {
  weight: number;
  dailyQuantity: number;
  unlimitedQuantity: boolean;
  onWeightChange: (weight: number) => void;
  onQuantityChange: (quantity: number) => void;
  onUnlimitedChange: (unlimited: boolean) => void;
  businessType?: BusinessType;
}) {
  const terms = getBusinessTerms(businessType);
  return (
    <section className="dish-section">
      <h3>Параметры</h3>
      <div className="dish-two-fields">
        <label>
          Вес
          <span>
            <NumericInput value={weight} onChange={onWeightChange} />
            г
          </span>
        </label>
        <label>
          Остаток на сегодня
          <span>
            <NumericInput
              value={dailyQuantity}
              step={1}
              disabled={unlimitedQuantity}
              onChange={onQuantityChange}
            />
            шт
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
