// The full-v1 marker is emitted only after both storage objects are uploaded.
// Legacy files and external URLs must never acquire an invented preview URL.
export function productPreviewUrl(source: string): string {
  return source.replace(
    /(\/storage\/v1\/object\/public\/catalog-assets\/[^/?]+\/media\/[a-f0-9]{64})\.full-v1\.(?:jpg|png|webp|avif)(?=\?|$)/,
    '$1.thumb-v1.webp'
  );
}
