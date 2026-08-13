import { ChevronRight, Image, Paintbrush } from 'lucide-react';
import { type BusinessType } from '../../shared/businessTerminology';

export function DesignSettingsHome({
  onOpenTheme,
  onOpenPhotoQuality,
  businessType = 'restaurant'
}: {
  onOpenTheme: () => void;
  onOpenPhotoQuality: () => void;
  businessType?: BusinessType;
}) {
  const itemsLabel = businessType === 'restaurant' ? 'блюд' : businessType === 'coffee_shop' ? 'позиций' : 'товаров';
  return (
    <main className="settings-screen design-settings-home">
      <p className="design-settings-home__intro">
        Настройте внешний вид приложения и отображение фотографий {itemsLabel}.
      </p>

      <button className="design-section-card" type="button" onClick={onOpenTheme}>
        <span className="design-section-card__icon"><Paintbrush /></span>
        <span>
          <strong>Тема</strong>
          <small>Настройка оформления приложения: цвета, фон, градиент, изображения и внешний вид.</small>
        </span>
        <ChevronRight />
      </button>

      <button className="design-section-card" type="button" onClick={onOpenPhotoQuality}>
        <span className="design-section-card__icon"><Image /></span>
        <span>
          <strong>Качество фотографий</strong>
          <small>Настройка отображения фотографий {itemsLabel}: сочность, яркость, контрастность, резкость и другие параметры.</small>
        </span>
        <ChevronRight />
      </button>
    </main>
  );
}
