import { describe, expect, it } from 'vitest';
import { getDebtControlState } from '../../src/features/restaurant-billing/debtControl';

describe('platform debt control', () => {
  const base = {
    warningAmount: 4_000,
    limitAmount: 5_000,
    limitReachedAt: null,
    deadline: null,
    blocked: false,
    now: new Date('2026-08-06T12:00:00.000Z')
  };

  it('keeps an account clear below the warning boundary', () => {
    expect(getDebtControlState({ ...base, debtAmount: 3_999.99 })).toEqual({
      tone: 'clear',
      secondsRemaining: null,
      blocksNewWork: false
    });
  });

  it('warns from exactly 4 000 ₽ without starting the grace countdown', () => {
    expect(getDebtControlState({ ...base, debtAmount: 4_000 })).toEqual({
      tone: 'warning',
      secondsRemaining: null,
      blocksNewWork: false
    });
  });

  it('starts a precise countdown at 5 000 ₽ and permits new work during the grace period', () => {
    expect(getDebtControlState({
      ...base,
      debtAmount: 5_000,
      limitReachedAt: '2026-08-06T11:00:00.000Z',
      deadline: '2026-08-07T11:00:00.000Z'
    })).toEqual({
      tone: 'countdown',
      secondsRemaining: 82_800,
      blocksNewWork: false
    });
  });

  it('blocks only new work when the grace deadline expires', () => {
    expect(getDebtControlState({
      ...base,
      debtAmount: 5_100,
      limitReachedAt: '2026-08-05T11:00:00.000Z',
      deadline: '2026-08-06T11:00:00.000Z'
    })).toEqual({
      tone: 'blocked',
      secondsRemaining: 0,
      blocksNewWork: true
    });
  });

  it('blocks at the exact deadline without an extra second of new work', () => {
    expect(getDebtControlState({
      ...base,
      debtAmount: 5_000,
      limitReachedAt: '2026-08-05T12:00:00.000Z',
      deadline: '2026-08-06T12:00:00.000Z'
    })).toEqual({
      tone: 'blocked',
      secondsRemaining: 0,
      blocksNewWork: true
    });
  });

  it('clears a stored block immediately after platform debt drops below the limit', () => {
    expect(getDebtControlState({
      ...base,
      debtAmount: 4_999.99,
      limitReachedAt: '2026-08-05T11:00:00.000Z',
      deadline: '2026-08-06T11:00:00.000Z',
      blocked: true
    })).toEqual({
      tone: 'warning',
      secondsRemaining: null,
      blocksNewWork: false
    });
  });
});
