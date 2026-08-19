import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_SESSION_KEY,
  COOKIE_CHOICE_KEY,
  normalizeAnalyticsRoute,
  readCookieChoice,
  saveCookieChoice,
  startConsentGatedAnalytics,
  type CookieChoice
} from '../../src/shared/analyticsConsent';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
};

const createHarness = (initialChoice: CookieChoice | null = null, initialSession: string | null = null) => {
  const storage = createStorage();
  if (initialChoice) {
    storage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({
      choice: initialChoice,
      version: '3.1',
      decidedAt: '2026-08-19T10:00:00.000Z'
    }));
  }
  if (initialSession) storage.setItem(ANALYTICS_SESSION_KEY, initialSession);

  let route = '/catalog';
  let choiceListener: ((choice: CookieChoice) => void) | null = null;
  let navigationListener: (() => void) | null = null;
  const record = vi.fn(async () => undefined);
  const withdraw = vi.fn(async () => undefined);
  const tracker = startConsentGatedAnalytics({
    storage,
    createSessionId: () => '11111111-1111-4111-8111-111111111111',
    getRoute: () => route,
    record,
    withdraw,
    onChoice: (listener) => {
      choiceListener = listener;
      return () => { choiceListener = null; };
    },
    onNavigation: (listener) => {
      navigationListener = listener;
      return () => { navigationListener = null; };
    }
  });

  return {
    storage,
    record,
    withdraw,
    tracker,
    allow: () => choiceListener?.('analytics'),
    deny: () => choiceListener?.('necessary'),
    navigate: (nextRoute: string) => {
      route = nextRoute;
      navigationListener?.();
    }
  };
};

describe('cookie analytics consent', () => {
  it('uses policy-versioned, separate keys for the choice and anonymous session', () => {
    expect(COOKIE_CHOICE_KEY).toBe('wayyaam:cookie-choice:3.1');
    expect(ANALYTICS_SESSION_KEY).toBe('wayyaam:analytics-session:3.1');
  });

  it('stores a versioned choice and timestamp', () => {
    const storage = createStorage();

    saveCookieChoice('analytics', storage, () => new Date('2026-08-19T12:34:56.000Z'));

    expect(JSON.parse(storage.values.get(COOKIE_CHOICE_KEY) ?? '')).toEqual({
      choice: 'analytics',
      version: '3.1',
      decidedAt: '2026-08-19T12:34:56.000Z'
    });
    expect(readCookieChoice(storage)).toBe('analytics');
  });

  it('accepts only current valid choices and safely ignores damaged storage', () => {
    const storage = createStorage();
    expect(readCookieChoice(storage)).toBeNull();

    storage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({ choice: 'necessary', version: '3.1' }));
    expect(readCookieChoice(storage)).toBe('necessary');
    storage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({ choice: 'analytics', version: '3.0' }));
    expect(readCookieChoice(storage)).toBeNull();
    storage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({ choice: 'advertising', version: '3.1' }));
    expect(readCookieChoice(storage)).toBeNull();
    storage.setItem(COOKIE_CHOICE_KEY, '{broken');
    expect(readCookieChoice(storage)).toBeNull();
  });

  it('does not send or create an identifier before explicit consent', () => {
    const { storage, record } = createHarness();

    expect(record).not.toHaveBeenCalled();
    expect(storage.getItem(ANALYTICS_SESSION_KEY)).toBeNull();
  });

  it('starts once after consent and records only coarse page routes', async () => {
    const { allow, navigate, record, storage } = createHarness();

    allow();
    allow();
    navigate('/catalog');
    navigate('/checkout?order=private');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(3));

    expect(storage.getItem(ANALYTICS_SESSION_KEY)).toBe('11111111-1111-4111-8111-111111111111');
    expect(record.mock.calls).toEqual([
      [{ eventName: 'analytics_enabled', route: '/catalog', sessionId: '11111111-1111-4111-8111-111111111111' }],
      [{ eventName: 'page_view', route: '/catalog', sessionId: '11111111-1111-4111-8111-111111111111' }],
      [{ eventName: 'page_view', route: '/checkout', sessionId: '11111111-1111-4111-8111-111111111111' }]
    ]);
  });

  it('stops immediately and deletes the analytics identifier after withdrawal', async () => {
    const { deny, navigate, record, storage, withdraw } = createHarness('analytics');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));

    deny();
    navigate('/profile');

    expect(withdraw).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(storage.getItem(ANALYTICS_SESSION_KEY)).toBeNull();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing anonymous session and detaches every listener when stopped', async () => {
    const harness = createHarness('analytics', '22222222-2222-4222-8222-222222222222');
    harness.tracker();
    harness.navigate('/checkout');
    harness.allow();

    await vi.waitFor(() => expect(harness.record).toHaveBeenCalledTimes(1));
    expect(harness.record).toHaveBeenCalledWith({
      eventName: 'page_view',
      route: '/catalog',
      sessionId: '22222222-2222-4222-8222-222222222222'
    });
  });

  it('does not call the deletion endpoint when no analytics session exists', () => {
    const { deny, withdraw } = createHarness();
    deny();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('does not expose slugs, ids or query values in analytics routes', () => {
    expect(normalizeAnalyticsRoute('/', '#/mangal?phone=79280000000')).toBe('/catalog');
    expect(normalizeAnalyticsRoute('/', '#/checkout?order=66b2f4ca-54cc-4eb0-9451-9b19fc0194b1')).toBe('/checkout');
    expect(normalizeAnalyticsRoute('/unknown/private-value', '/checkout?order=private')).toBe('/checkout');
    expect(normalizeAnalyticsRoute('/', '#/profile/orders/66b2f4ca-54cc-4eb0-9451-9b19fc0194b1')).toBe('/profile');
    expect(normalizeAnalyticsRoute('/unknown/private-value', '')).toBe('/other');
    expect(normalizeAnalyticsRoute('', '')).toBe('/catalog');
  });

  it.each([
    ['/admin/users', '/admin'],
    ['/business/mangal/orders', '/business'],
    ['/catalog', '/catalog'],
    ['/checkout?phone=1', '/checkout'],
    ['/driver/map', '/driver'],
    ['/login', '/login'],
    ['/orders/secret', '/orders'],
    ['/pos', '/pos'],
    ['/profile/history', '/profile'],
    ['/restaurants?city=private', '/catalog']
  ])('groups %s as %s', (source, expected) => {
    expect(normalizeAnalyticsRoute(source)).toBe(expected);
  });
});
