import { describe, expect, it } from 'vitest';
import {
  REQUIRED_ACTIVATION_CONFIRMATIONS,
  canAcceptRestaurantLegalDocuments,
  canRestaurantAcceptRealOrders,
  createEmptyActivationConfirmations,
  getMissingActivationConfirmations,
  getRestaurantActivationProgress
} from '../../src/features/restaurant-activation/restaurantActivation';

describe('restaurant legal activation', () => {
  it('keeps every required legal confirmation separate and unchecked initially', () => {
    const confirmations = createEmptyActivationConfirmations();

    expect(REQUIRED_ACTIVATION_CONFIRMATIONS).toHaveLength(7);
    expect(Object.keys(confirmations)).toEqual(REQUIRED_ACTIVATION_CONFIRMATIONS.map(({ key }) => key));
    expect(Object.values(confirmations)).toEqual([false, false, false, false, false, false, false]);
    expect(getMissingActivationConfirmations(confirmations)).toEqual(
      REQUIRED_ACTIVATION_CONFIRMATIONS.map(({ key }) => key)
    );
  });

  it('requires every mandatory confirmation without making marketing consent mandatory', () => {
    const confirmations = createEmptyActivationConfirmations();
    const completeConfirmations = Object.fromEntries(
      Object.keys(confirmations).map((key) => [key, true])
    ) as typeof confirmations;

    expect(getMissingActivationConfirmations({ ...completeConfirmations, authority: false })).toEqual(['authority']);
    expect(getMissingActivationConfirmations(completeConfirmations)).toEqual([]);
  });

  it('allows an owner or an explicitly authorized member but never a platform administrator acting for the restaurant', () => {
    expect(canAcceptRestaurantLegalDocuments({ role: 'owner', canAcceptLegalDocuments: false })).toBe(true);
    expect(canAcceptRestaurantLegalDocuments({ role: 'admin', canAcceptLegalDocuments: true })).toBe(true);
    expect(canAcceptRestaurantLegalDocuments({ role: 'editor', canAcceptLegalDocuments: true })).toBe(true);
    expect(canAcceptRestaurantLegalDocuments({ role: 'admin', canAcceptLegalDocuments: false })).toBe(false);
    expect(canAcceptRestaurantLegalDocuments({ role: 'viewer', canAcceptLegalDocuments: false })).toBe(false);
    expect(canAcceptRestaurantLegalDocuments({ role: 'platform_admin', canAcceptLegalDocuments: true })).toBe(false);
    expect(canAcceptRestaurantLegalDocuments({ role: null, canAcceptLegalDocuments: true })).toBe(false);
  });

  it('allows real orders only after explicit activation, including formerly configured restaurants', () => {
    expect(canRestaurantAcceptRealOrders('active')).toBe(true);
    expect(canRestaurantAcceptRealOrders('draft')).toBe(false);
    expect(canRestaurantAcceptRealOrders('configured')).toBe(false);
    expect(canRestaurantAcceptRealOrders('awaiting_acceptance')).toBe(false);
    expect(canRestaurantAcceptRealOrders('legacy_review_required')).toBe(false);
    expect(canRestaurantAcceptRealOrders('suspended')).toBe(false);
    expect(canRestaurantAcceptRealOrders('terminated')).toBe(false);
    expect(canRestaurantAcceptRealOrders('archived')).toBe(false);
  });

  it('reports the five visible activation stages from observable progress', () => {
    expect(getRestaurantActivationProgress({ documentsOpened: 0, documentCount: 2, confirmationsComplete: false, codeRequested: false, active: false })).toBe(1);
    expect(getRestaurantActivationProgress({ documentsOpened: 1, documentCount: 2, confirmationsComplete: false, codeRequested: false, active: false })).toBe(2);
    expect(getRestaurantActivationProgress({ documentsOpened: 2, documentCount: 2, confirmationsComplete: false, codeRequested: false, active: false })).toBe(2);
    expect(getRestaurantActivationProgress({ documentsOpened: 1, documentCount: 2, confirmationsComplete: true, codeRequested: false, active: false })).toBe(2);
    expect(getRestaurantActivationProgress({ documentsOpened: 0, documentCount: 0, confirmationsComplete: true, codeRequested: false, active: false })).toBe(1);
    expect(getRestaurantActivationProgress({ documentsOpened: 2, documentCount: 2, confirmationsComplete: true, codeRequested: false, active: false })).toBe(3);
    expect(getRestaurantActivationProgress({ documentsOpened: 2, documentCount: 2, confirmationsComplete: true, codeRequested: true, active: false })).toBe(4);
    expect(getRestaurantActivationProgress({ documentsOpened: 2, documentCount: 2, confirmationsComplete: true, codeRequested: true, active: true })).toBe(5);
  });
});
