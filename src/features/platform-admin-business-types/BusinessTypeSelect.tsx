import type { BusinessType, BusinessTypeDefinition } from '../../shared/businessRegistry';
import { isBusinessType } from '../../shared/businessRegistry';

const availabilitySuffix = (option: BusinessTypeDefinition) => {
  if (option.availability === 'disabled') return ' — скоро';
  if (option.availability === 'compliance_blocked') return ' — требуется проверка';
  return '';
};

export function BusinessTypeSelect({
  id,
  value,
  options,
  onChange,
  error
}: {
  readonly id: string;
  readonly value: BusinessType;
  readonly options: ReadonlyArray<BusinessTypeDefinition>;
  readonly onChange: (value: BusinessType) => void;
  readonly error?: string;
}) {
  return (
    <label htmlFor={id}>
      <span>
        Тип бизнеса <b>*</b>
      </span>
      <select
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          if (isBusinessType(event.target.value)) onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option
            key={option.code}
            value={option.code}
            disabled={option.availability !== 'active'}
          >
            {option.emoji} {option.label}{availabilitySuffix(option)}
          </option>
        ))}
      </select>
      <em>Шаблон меняет интерфейс, но tenant, авторизация и заказы остаются общими.</em>
      {error && <small>{error}</small>}
    </label>
  );
}
