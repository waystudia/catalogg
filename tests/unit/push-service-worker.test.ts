import { afterEach, describe, expect, it, vi } from 'vitest';

const getRegistration = () => ({ scope: 'https://wayyaam.ru/' } as ServiceWorkerRegistration);

const loadPushRegistration = async ({
  canRegister = true,
  baseUrl = '/',
  register = vi.fn(async () => getRegistration()),
  serviceWorkerSupported = true
}: {
  canRegister?: boolean;
  baseUrl?: string;
  register?: ReturnType<typeof vi.fn>;
  serviceWorkerSupported?: boolean;
} = {}) => {
  vi.resetModules();
  vi.stubEnv('BASE_URL', baseUrl);
  vi.stubGlobal('window', {
    __WAYYAAM_PWA_RETIREMENT__: Promise.resolve(canRegister)
  });
  const serviceWorker = { register };
  vi.stubGlobal('navigator', serviceWorkerSupported
    ? { serviceWorker }
    : new Proxy({}, {
      has: () => false,
      get: (_target, property) => property === 'serviceWorker' ? serviceWorker : undefined
    }));

  const { ensurePushServiceWorkerRegistration } = await import('../../src/shared/pushServiceWorker');
  return { ensurePushServiceWorkerRegistration, register };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('iPhone background push worker registration', () => {
  it('registers the network-only push worker at the application scope', async () => {
    const registration = getRegistration();
    const register = vi.fn(async () => registration);
    const subject = await loadPushRegistration({ register });

    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js?mode=push', { scope: '/' });
  });

  it('normalizes a configured sub-path before registering the worker', async () => {
    const subject = await loadPushRegistration({ baseUrl: '/catalogg' });

    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toEqual({
      scope: 'https://wayyaam.ru/'
    });
    expect(subject.register).toHaveBeenCalledWith('/catalogg/sw.js?mode=push', {
      scope: '/catalogg/'
    });
  });

  it('does not replace a page while legacy PWA cleanup is scheduling its one clean reload', async () => {
    const subject = await loadPushRegistration({ canRegister: false });

    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toBeNull();
    expect(subject.register).not.toHaveBeenCalled();
  });

  it('retries after a transient service-worker registration failure', async () => {
    const registration = getRegistration();
    const register = vi.fn()
      .mockRejectedValueOnce(new Error('temporary worker failure'))
      .mockResolvedValueOnce(registration);
    const subject = await loadPushRegistration({ register });

    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toBeNull();
    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight registration across simultaneous startup and subscription calls', async () => {
    const registration = getRegistration();
    const register = vi.fn(async () => registration);
    const subject = await loadPushRegistration({ register });

    const startupRegistration = subject.ensurePushServiceWorkerRegistration();
    const subscriptionRegistration = subject.ensurePushServiceWorkerRegistration();

    expect(subscriptionRegistration).toBe(startupRegistration);
    await expect(Promise.all([startupRegistration, subscriptionRegistration])).resolves.toEqual([
      registration,
      registration
    ]);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('returns an unsupported result without attempting registration', async () => {
    const subject = await loadPushRegistration({ serviceWorkerSupported: false });

    await expect(subject.ensurePushServiceWorkerRegistration()).resolves.toBeNull();
    expect(subject.register).not.toHaveBeenCalled();
  });
});
