/** Resize on the uploader's device, once; visitors download a cached static file. */
export async function createCatalogPreview(blob: Blob): Promise<Blob | null> {
  // Preserve animated GIFs. Unsupported encoders/decoders keep the full image.
  if (blob.type === 'image/gif') return null;
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    const preview = await imageCompression(new File([blob], 'photo', { type: blob.type }), {
      maxSizeMB: 0.045,
      maxWidthOrHeight: 400,
      initialQuality: 0.72,
      fileType: 'image/webp',
      useWebWorker: false
    });
    return preview.type === 'image/webp' && preview.size > 0 && preview.size < blob.size ? preview : null;
  } catch {
    return null;
  }
}
