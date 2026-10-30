/** Short, bounded, memory-only cache. Callers must bypass it for authenticated sessions. */
export function createPublicMenuCache<T>(ttlMs = 15_000, now = Date.now) {
  const values = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const cached = values.get(key);
      if (cached && cached.expiresAt > now()) return structuredClone(cached.value);
      let request = pending.get(key);
      if (!request) {
        const version = generation;
        request = Promise.resolve().then(load).then(value => {
          if (generation === version && value != null) {
            values.delete(key);
            values.set(key, { value: structuredClone(value), expiresAt: now() + ttlMs });
            while (values.size > 32) values.delete(values.keys().next().value!);
          }
          return value;
        }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
        pending.set(key, request);
      }
      return structuredClone(await request);
    },
    clear() { generation++; values.clear(); pending.clear(); }
  };
}
