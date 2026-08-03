import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react';
import { CakeSlice } from 'lucide-react';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & { fallbackKind?: 'dessert' };

type DataImageCacheEntry = {
  refs: number;
  promise: Promise<string>;
};

const dataImageCache = new Map<string, DataImageCacheEntry>();

const catalogImageWidth = (width: SafeImageProps['width']) => {
  const numericWidth = typeof width === 'number' ? width : Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) return 640;
  return Math.max(64, Math.min(1200, Math.round(numericWidth)));
};

const deliveryImageSource = (src: string | undefined, width: SafeImageProps['width']) => {
  if (!src || src.startsWith('data:')) return src ?? '';

  try {
    const source = new URL(src);
    if (source.hostname !== 'images.unsplash.com') return src;

    source.searchParams.set('auto', 'format');
    source.searchParams.set('fit', source.searchParams.get('fit') || 'crop');
    source.searchParams.set('w', String(catalogImageWidth(width)));
    source.searchParams.set('q', '72');
    return `/media/unsplash${source.pathname}?${source.searchParams.toString()}`;
  } catch {
    return src;
  }
};

const acquireDataImage = (source: string) => {
  const cached = dataImageCache.get(source);
  if (cached) {
    cached.refs += 1;
    return cached.promise;
  }

  const entry: DataImageCacheEntry = {
    refs: 1,
    promise: fetch(source)
      .then((response) => response.blob())
      .then((blob) => URL.createObjectURL(blob))
  };
  dataImageCache.set(source, entry);
  void entry.promise.catch(() => {
    if (dataImageCache.get(source) === entry) dataImageCache.delete(source);
  });
  return entry.promise;
};

const releaseDataImage = (source: string) => {
  const entry = dataImageCache.get(source);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;

  void entry.promise.then((objectUrl) => {
    if (dataImageCache.get(source) !== entry || entry.refs > 0) return;
    dataImageCache.delete(source);
    URL.revokeObjectURL(objectUrl);
  }).catch(() => undefined);
};

export function SafeImage({
  src,
  alt,
  className,
  fallbackKind,
  width,
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const label = alt || 'Изображение';
  const deliveredSource = useMemo(() => deliveryImageSource(src, width), [src, width]);
  const [resolvedSource, setResolvedSource] = useState(() => deliveredSource.startsWith('data:') ? '' : deliveredSource);

  useEffect(() => {
    setFailed(false);
    if (!deliveredSource.startsWith('data:')) {
      setResolvedSource(deliveredSource);
      return undefined;
    }

    let isCurrent = true;
    setResolvedSource('');
    void acquireDataImage(deliveredSource).then((objectUrl) => {
      if (isCurrent) setResolvedSource(objectUrl);
    }).catch(() => {
      if (isCurrent) setFailed(true);
    });

    return () => {
      isCurrent = false;
      releaseDataImage(deliveredSource);
    };
  }, [deliveredSource]);

  if (!resolvedSource || failed) {
    return (
      <div className={`${className ? `image-fallback ${className}` : 'image-fallback'}${fallbackKind ? ` image-fallback--${fallbackKind}` : ''}`} role="img" aria-label={label}>
        {fallbackKind === 'dessert' && <CakeSlice aria-hidden="true" />}
        <em>{fallbackKind === 'dessert' ? 'Фото скоро' : label}</em>
      </div>
    );
  }

  return (
    <img
      {...props}
      className={className}
      src={resolvedSource}
      alt={alt}
      width={width}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
