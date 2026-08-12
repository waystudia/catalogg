import { describe, expect, it } from 'vitest';
import {
  getSubstitutionAmountEffect,
  getSubstitutionDecisionLabel,
  isPackingComplete,
  type PickingLineState
} from '../../src/entities/orderSubstitution';

describe('grocery substitution amount effect', () => {
  it('shows an additional charge when the accepted replacement is more expensive', () => {
    expect(getSubstitutionAmountEffect(289, 340)).toEqual({
      delta: 51,
      kind: 'additional_charge',
      label: 'Доплата 51 ₽'
    });
  });

  it('shows a refund when the replacement is cheaper', () => {
    expect(getSubstitutionAmountEffect(340, 289)).toEqual({
      delta: -51,
      kind: 'refund',
      label: 'Вернём 51 ₽'
    });
  });

  it('keeps the total neutral for an equal-price replacement', () => {
    expect(getSubstitutionAmountEffect(120, 120)).toEqual({
      delta: 0,
      kind: 'none',
      label: 'Без изменения суммы'
    });
  });
});

describe('grocery picking completion', () => {
  it('requires every line to be picked, substituted, or removed', () => {
    const complete: PickingLineState[] = ['picked', 'substituted', 'removed'];
    expect(isPackingComplete(complete)).toBe(true);
    expect(isPackingComplete([...complete, 'pending'])).toBe(false);
    expect(isPackingComplete([...complete, 'substitution_pending'])).toBe(false);
    expect(isPackingComplete([])).toBe(false);
  });
});

describe('substitution decision labels', () => {
  it('keeps customer decisions distinct', () => {
    expect(getSubstitutionDecisionLabel('accepted')).toBe('Замена принята');
    expect(getSubstitutionDecisionLabel('removed')).toBe('Товар удалён');
    expect(getSubstitutionDecisionLabel('alternative_requested')).toBe('Нужен другой вариант');
  });
});
