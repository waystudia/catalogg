import { ChevronRight, Image, Paintbrush } from 'lucide-react';

export function DesignSettingsHome({
  onOpenTheme,
  onOpenPhotoQuality
}: {
  onOpenTheme: () => void;
  onOpenPhotoQuality: () => void;
}) {
  return (
    <main className="settings-screen design-settings-home">
      <p className="design-settings-home__intro">
        Настройте внешний вид приложения и отображение фотографий блюд.
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
          <small>Настройка отображения фотографий блюд: сочность, яркость, контрастность, резкость и другие параметры.</small>
        </span>
        <ChevronRight />
      </button>
    </main>
  );
}

