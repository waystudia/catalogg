import { describe, expect, it } from 'vitest';
import {
  getCombinedDispatchReadinessMessage,
  mapCombinedOrderDispatchReadiness
} from '../../src/features/combined-order/dispatchReadiness';

describe('combined order dispatch readiness', () => {
  it('blocks dispatch and names merchants which are still preparing', () => {
    const readiness = mapCombinedOrderDispatchReadiness({
      is_combined: true,
      can_dispatch: false,
      pending_merchants: [
        { id: 'finik', name: 'Финик', status: 'preparing', is_addon: true }
      ]
    });

    expect(readiness).toEqual({
      isCombined: true,
      canDispatch: false,
      pendingMerchants: [
        { id: 'finik', name: 'Финик', status: 'preparing', isAddon: true }
      ]
    });
    expect(getCombinedDispatchReadinessMessage(readiness)).toBe(
      'Доставка станет доступна, когда будет готов: Финик.'
    );
  });

  it('allows one shared delivery only after every merchant is ready', () => {
    const readiness = mapCombinedOrderDispatchReadiness({
      is_combined: true,
      can_dispatch: true,
      pending_merchants: []
    });

    expect(readiness.canDispatch).toBe(true);
    expect(getCombinedDispatchReadinessMessage(readiness)).toBe(
      'Оба заказа готовы. Можно вызвать одну общую доставку.'
    );
  });
});
