import type { SupabaseClient } from '@supabase/supabase-js';

// Drafts can use data URLs. Persisted catalog records contain only file URLs.
export async function persistCatalogMedia<T>(client: SupabaseClient, catalogId: string, value: T): Promise<T> {
  const uploaded = new Map<string, string>();
  const visit = async (item: unknown): Promise<unknown> => {
    if (typeof item === 'string' && item.startsWith('data:image/')) {
      const cached = uploaded.get(item);
      if (cached) return cached;
      const blob = await (await fetch(item)).blob();
      const extensions: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'image/gif': 'gif', 'image/avif': 'avif'
      };
      const extension = extensions[blob.type];
      if (!extension || blob.size === 0 || blob.size > 6 * 1024 * 1024) {
        throw new Error('Фото должно быть JPG, PNG, WebP, GIF или AVIF размером до 6 МБ.');
      }
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const path = `${catalogId}/media/${hash}.${extension}`;
      const bucket = client.storage.from('catalog-assets');
      const { error } = await bucket.upload(path, blob, {
        contentType: blob.type, cacheControl: '31536000', upsert: true
      });
      if (error) throw error;
      const url = bucket.getPublicUrl(path).data.publicUrl;
      uploaded.set(item, url);
      return url;
    }
    if (Array.isArray(item)) {
      const result = [];
      for (const child of item) result.push(await visit(child));
      return result;
    }
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(item)) result[key] = await visit(child);
      return result;
    }
    return item;
  };
  return await visit(value) as T;
}
