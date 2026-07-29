import { useState, type ImgHTMLAttributes } from 'react';

export function SafeImage({ src, alt, className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  const label = alt || 'Изображение';

  if (!src || failed) {
    return (
      <div className={className ? `image-fallback ${className}` : 'image-fallback'} role="img" aria-label={label}>
        <em>{label}</em>
      </div>
    );
  }

  return <img {...props} className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}
