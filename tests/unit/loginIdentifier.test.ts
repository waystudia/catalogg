import { describe, expect, it } from 'vitest';
import { buildPasswordCredentials, normalizeLoginPhone } from '../../src/shared/loginIdentifier';

describe('unified login identifier', () => {
  it('builds normalized email credentials', () => {
    expect(buildPasswordCredentials(' Owner@Example.RU ', 'secret')).toEqual({
      email: 'owner@example.ru',
      password: 'secret'
    });
  });

  it('builds E.164 credentials from a Russian phone', () => {
    expect(normalizeLoginPhone('8 (928) 123-45-67')).toBe('+79281234567');
    expect(buildPasswordCredentials('8 (928) 123-45-67', 'secret')).toEqual({
      phone: '+79281234567',
      password: 'secret'
    });
  });

  it('rejects an invalid identifier before authentication', () => {
    expect(() => buildPasswordCredentials('not-an-account', 'secret')).toThrow(
      'Введите корректный телефон или email.'
    );
  });
});
