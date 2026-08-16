const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlatformProductWrite =
  | { kind: 'update'; productId: string }
  | { kind: 'upsert'; productId: string }
  | { kind: 'insert' };

export function resolvePlatformProductWrite(localProductId: string, existingProductId: string | null): PlatformProductWrite {
  if (existingProductId) return { kind: 'update', productId: existingProductId };
  if (uuidPattern.test(localProductId)) return { kind: 'upsert', productId: localProductId };
  return { kind: 'insert' };
}
