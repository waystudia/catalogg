export type PickingLineState =
  | 'pending'
  | 'picked'
  | 'unavailable'
  | 'substitution_pending'
  | 'substituted'
  | 'removed';

export type SubstitutionDecision = 'accepted' | 'removed' | 'alternative_requested';

export const getSubstitutionAmountEffect = (originalAmount: number, proposedAmount: number) => {
  const delta = proposedAmount - originalAmount;
  if (delta > 0) {
    return { delta, kind: 'additional_charge' as const, label: `Доплата ${delta} ₽` };
  }
  if (delta < 0) {
    return { delta, kind: 'refund' as const, label: `Вернём ${Math.abs(delta)} ₽` };
  }
  return { delta: 0, kind: 'none' as const, label: 'Без изменения суммы' };
};

export const isPackingComplete = (states: PickingLineState[]) =>
  states.length > 0 && states.every((state) => ['picked', 'substituted', 'removed'].includes(state));

export const getSubstitutionDecisionLabel = (decision: SubstitutionDecision) => {
  if (decision === 'accepted') return 'Замена принята';
  if (decision === 'removed') return 'Товар удалён';
  return 'Нужен другой вариант';
};
