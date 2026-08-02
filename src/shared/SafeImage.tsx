import { useState, type ImgHTMLAttributes } from 'react';
import { CakeSlice } from 'lucide-react';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & { fallbackKind?: 'dessert' };

export function SafeImage({ src, alt, className, fallbackKind, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const label = alt || 'Изображение';

  if (!src || failed) {
    return (
      <div className={`${className ? `image-fallback ${className}` : 'image-fallback'}${fallbackKind ? ` image-fallback--${fallbackKind}` : ''}`} role="img" aria-label={label}>
        {fallbackKind === 'dessert' && <CakeSlice aria-hidden="true" />}
        <em>{fallbackKind === 'dessert' ? 'Фото скоро' : label}</em>
      </div>
    );
  }

  return <img {...props} className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}
