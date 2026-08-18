import { LocateFixed, MapPin, Plus, Store, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { Restaurant } from '../../entities/models';
import { DeliveryMapPicker } from '../../shared/DeliveryMapPicker';
import { imageFileToDataUrl } from '../../shared/images';
import {
  buildYandexMapLink,
  makeRestaurantCoordinates,
  parseCoordinateInput,
  parseRestaurantCoordinatesFromMapLink
} from '../../shared/restaurantLocation';

const DEFAULT_RESTAURANT_LOCATION = { lat: 43.3184, lng: 45.6927 };

export function ProfileSettings({
  restaurant,
  onSave
}: {
  restaurant: Restaurant;
  onSave: (restaurant: Restaurant) => void;
}) {
  const [draft, setDraft] = useState(restaurant);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isRestaurantMapOpen, setIsRestaurantMapOpen] = useState(false);
  const coverImages = Array.from(
    new Set([...(draft.banner_urls ?? []), draft.banner_url].map((value) => value?.trim()).filter(Boolean))
  ).slice(0, 3) as string[];

  useEffect(() => {
    setDraft(restaurant);
  }, [restaurant]);

  const updateLogo = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      setError('Логотип должен быть в PNG.');
      return;
    }
    const value = await imageFileToDataUrl(file, 'logo');
    setDraft((current) => ({ ...current, logo_url: value }));
    setError('');
  };

  const updateBanner = async (index: number, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Обложка должна быть изображением.');
      return;
    }
    const value = await imageFileToDataUrl(file);
    setDraft((current) => {
      const images = Array.from(
        new Set([...(current.banner_urls ?? []), current.banner_url].map((url) => url?.trim()).filter(Boolean))
      ).slice(0, 3) as string[];
      images[index] = value;
      const normalized = images.filter(Boolean).slice(0, 3);
      return { ...current, banner_url: normalized[0] ?? '', banner_urls: normalized };
    });
    setError('');
  };

  const removeBanner = (index: number) => {
    const images = coverImages.filter((_, imageIndex) => imageIndex !== index);
    setDraft((current) => ({ ...current, banner_url: images[0] ?? '', banner_urls: images }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Название ресторана обязательно.');
      return;
    }
    if (draft.whatsapp && !/^\+?\d{10,15}$/.test(draft.whatsapp)) {
      setError('WhatsApp должен быть в формате +79990000000.');
      return;
    }
    const coordinatesFromFields = makeRestaurantCoordinates(draft.lat, draft.lng);
    const coordinatesFromLink = parseRestaurantCoordinatesFromMapLink(draft.mapLink);
    if ((draft.lat !== null || draft.lng !== null) && !coordinatesFromFields && !coordinatesFromLink) {
      setError('Укажите корректные координаты ресторана.');
      return;
    }
    const coordinates = coordinatesFromLink ?? coordinatesFromFields;
    onSave({
      ...draft,
      name: draft.name.trim(),
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      mapLink: draft.mapLink || (coordinates ? buildYandexMapLink(coordinates.lat, coordinates.lng) : '')
    });
    setError('Сохранено');
  };

  const applyCoordinates = (lat: number, lng: number, replaceMapLink = false) => {
    setDraft((current) => ({
      ...current,
      lat,
      lng,
      mapLink: replaceMapLink || !current.mapLink ? buildYandexMapLink(lat, lng) : current.mapLink
    }));
    setError('');
  };

  const applyManualRestaurantPoint = ({ lat, lng }: { lat: number; lng: number }) => {
    applyCoordinates(Number(lat.toFixed(7)), Number(lng.toFixed(7)), true);
  };

  const applyCoordinatesFromMapLink = () => {
    const coordinates = parseRestaurantCoordinatesFromMapLink(draft.mapLink);
    if (!coordinates) {
      setError('Не удалось найти координаты в ссылке.');
      return;
    }
    applyCoordinates(coordinates.lat, coordinates.lng);
  };

  const locateRestaurant = () => {
    if (!navigator.geolocation) {
      setError('Браузер не поддерживает геолокацию.');
      return;
    }
    setIsLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoordinates(Number(position.coords.latitude.toFixed(7)), Number(position.coords.longitude.toFixed(7)));
        setIsLocating(false);
      },
      () => {
        setError('Не удалось получить местоположение. Проверьте разрешение браузера.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  return (
    <main className="settings-screen">
      <form className="settings-form-card" onSubmit={submit}>
        <div className="profile-field">
          <span>Название ресторана</span>
          <div className="profile-identity-field">
            <label className="profile-logo-picker" aria-label="Заменить логотип">
              <input
                type="file"
                accept="image/png"
                onChange={(event) => void updateLogo(event.target.files?.[0])}
              />
              {draft.logo_url ? <img src={draft.logo_url} alt="" /> : <Store />}
            </label>
            <input
              value={draft.name}
              required
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="profile-logo-actions">
            <small>Нажмите на логотип, чтобы заменить PNG.</small>
            {draft.logo_url && (
              <button type="button" onClick={() => setDraft({ ...draft, logo_url: '' })}>
                Удалить логотип
              </button>
            )}
          </div>
        </div>
        <label>
          Описание
          <textarea
            maxLength={200}
            value={draft.subtitle}
            onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
          />
          <small>{draft.subtitle.length}/200</small>
        </label>
        <div className="profile-field">
          <span>Обложки ресторана</span>
          <div className="profile-cover-grid">
            {[0, 1, 2].map((index) => (
              <div className="profile-cover-slot" key={index}>
                <label className="profile-cover-picker">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void updateBanner(index, event.target.files?.[0])}
                  />
                  {coverImages[index]
                    ? <img src={coverImages[index]} alt={`Обложка ${index + 1}`} />
                    : <span><Plus />Добавить</span>}
                </label>
                {coverImages[index] && (
                  <button type="button" onClick={() => removeBanner(index)}>
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
          <small>До 3 изображений. На странице они листаются свайпом и меняются автоматически.</small>
        </div>
        <label>
          WhatsApp
          <input
            type="tel"
            value={draft.whatsapp}
            placeholder="+79990000000"
            onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value.replace(/[^\d+]/g, '') })}
          />
        </label>
        <label>
          Адрес
          <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label>
          Ссылка на карту
          <input
            type="url"
            value={draft.mapLink ?? ''}
            placeholder="https://yandex.ru/maps/..."
            onChange={(event) => setDraft({ ...draft, mapLink: event.target.value })}
          />
        </label>
        <div className="profile-location-tools">
          <button type="button" onClick={() => setIsRestaurantMapOpen(true)} disabled={isLocating}>
            <LocateFixed />
            Определить местоположение
          </button>
          <button type="button" onClick={applyCoordinatesFromMapLink}>
            <MapPin />
            Взять из ссылки
          </button>
        </div>
        <div className="profile-location-grid">
          <label>
            Широта для нашей карты
            <input
              inputMode="decimal"
              value={draft.lat ?? ''}
              placeholder="43.3178000"
              onChange={(event) => setDraft({ ...draft, lat: parseCoordinateInput(event.target.value) })}
            />
          </label>
          <label>
            Долгота для нашей карты
            <input
              inputMode="decimal"
              value={draft.lng ?? ''}
              placeholder="45.6986000"
              onChange={(event) => setDraft({ ...draft, lng: parseCoordinateInput(event.target.value) })}
            />
          </label>
        </div>
        <small className="profile-location-note">
          Координаты используются в нашей карте и в маршруте до ресторана. Яндекс-ссылка нужна для внешней навигации.
        </small>
        {isRestaurantMapOpen && (
          <div className="modal-backdrop delivery-map-backdrop">
            <div className="delivery-map-sheet">
              <button
                className="flow-modal__close"
                type="button"
                onClick={() => setIsRestaurantMapOpen(false)}
                aria-label="Закрыть карту"
              >
                <X />
              </button>
              <h2>Точка ресторана</h2>
              <DeliveryMapPicker
                lat={draft.lat ?? DEFAULT_RESTAURANT_LOCATION.lat}
                lng={draft.lng ?? DEFAULT_RESTAURANT_LOCATION.lng}
                isLocating={isLocating}
                error={error === 'Сохранено' ? '' : error}
                onLocate={locateRestaurant}
                onChange={applyManualRestaurantPoint}
                onSearchSelect={(result) => {
                  setDraft((current) => ({
                    ...current,
                    address: current.address || result.label
                  }));
                }}
                onDone={() => setIsRestaurantMapOpen(false)}
              />
            </div>
          </div>
        )}
        {error && <p className={error === 'Сохранено' ? 'settings-status' : 'settings-error'}>{error}</p>}
        <button className="primary-wide" type="submit">
          Сохранить изменения
        </button>
      </form>
    </main>
  );
}
