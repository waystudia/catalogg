export const MERCHANT_READY_MINUTE_OPTIONS = [10, 15, 20, 30] as const;

export type MerchantReadyMinutes = (typeof MERCHANT_READY_MINUTE_OPTIONS)[number];

export function MerchantReadyEstimatePicker({
  value,
  onChange
}: {
  readonly value: MerchantReadyMinutes;
  readonly onChange: (minutes: MerchantReadyMinutes) => void;
}) {
  return (
    <fieldset className="merchant-ready-estimate">
      <legend>Будет готов через</legend>
      <div>
        {MERCHANT_READY_MINUTE_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed={value === minutes}
            onClick={() => onChange(minutes)}
          >
            {minutes} мин
          </button>
        ))}
      </div>
    </fieldset>
  );
}
