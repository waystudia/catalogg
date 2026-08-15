export type CombinedOrderPendingMerchant = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly isAddon: boolean;
};

export type CombinedOrderDispatchReadiness = {
  readonly isCombined: boolean;
  readonly canDispatch: boolean;
  readonly pendingMerchants: readonly CombinedOrderPendingMerchant[];
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asString = (value: unknown) => typeof value === 'string' ? value : '';

export const mapCombinedOrderDispatchReadiness = (
  value: unknown
): CombinedOrderDispatchReadiness => {
  const row = asObject(value);
  const pendingValue = row?.pending_merchants ?? row?.pendingMerchants;
  const pendingMerchants = Array.isArray(pendingValue)
    ? pendingValue.flatMap((value) => {
        const merchant = asObject(value);
        const id = asString(merchant?.id);
        if (!merchant || !id) return [];
        return [{
          id,
          name: asString(merchant.name) || 'Заведение',
          status: asString(merchant.status),
          isAddon: merchant.is_addon === true || merchant.isAddon === true
        } satisfies CombinedOrderPendingMerchant];
      })
    : [];

  return {
    isCombined: row?.is_combined === true || row?.isCombined === true,
    canDispatch: row?.can_dispatch === true || row?.canDispatch === true,
    pendingMerchants
  };
};

export const getCombinedDispatchReadinessMessage = (
  readiness: CombinedOrderDispatchReadiness
) => {
  if (!readiness.isCombined) return '';
  if (readiness.canDispatch) {
    return 'Оба заказа готовы. Можно вызвать одну общую доставку.';
  }
  const names = readiness.pendingMerchants.map((merchant) => merchant.name);
  if (names.length === 0) return 'Проверяем готовность всех заказов…';
  return `Доставка станет доступна, когда ${names.length === 1 ? 'будет готов' : 'будут готовы'}: ${names.join(', ')}.`;
};
