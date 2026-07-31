import { describe, expect, it } from 'vitest';
import { assertExpectedLoginRole } from '../../src/shared/api/loginRedirectApi';

describe('staff login role selection', () => {
  it('accepts the matching driver and restaurant destinations', () => {
    expect(() => assertExpectedLoginRole('/driver', 'driver')).not.toThrow();
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'restaurant')).not.toThrow();
  });

  it('explains when a restaurant account is entered under driver', () => {
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'driver')).toThrow(
      'Это аккаунт ресторана. Выберите «Ресторан».'
    );
  });

  it('explains when a driver account is entered under restaurant', () => {
    expect(() => assertExpectedLoginRole('/driver', 'restaurant')).toThrow(
      'Это аккаунт водителя. Выберите «Водитель».'
    );
  });

  it('rejects accounts that have no selected staff role', () => {
    expect(() => assertExpectedLoginRole('/', 'restaurant')).toThrow(
      'Этот аккаунт не привязан к ресторану.'
    );
    expect(() => assertExpectedLoginRole('/admin', 'driver')).toThrow(
      'Это аккаунт ресторана. Выберите «Ресторан».'
    );
  });
});
