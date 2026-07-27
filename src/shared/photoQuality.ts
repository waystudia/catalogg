export type PhotoQualitySettings = {
  enabled: boolean;
  saturation: number;
  brightness: number;
  contrast: number;
  colorfulness: number;
  sharpness: number;
  warmth: number;
};

export const DEFAULT_PHOTO_QUALITY_SETTINGS: PhotoQualitySettings = {
  enabled: false,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  colorfulness: 0,
  sharpness: 0,
  warmth: 0
};

const clamp = (value: unknown, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
};

export const normalizePhotoQualitySettings = (value?: Partial<PhotoQualitySettings> | null): PhotoQualitySettings => ({
  enabled: value?.enabled === true,
  saturation: clamp(value?.saturation, -100, 100),
  brightness: clamp(value?.brightness, -100, 100),
  contrast: clamp(value?.contrast, -100, 100),
  colorfulness: clamp(value?.colorfulness, -100, 100),
  sharpness: clamp(value?.sharpness, 0, 100),
  warmth: clamp(value?.warmth, -100, 100)
});

const ratio = (value: number, strength = 1) => Math.max(0, 1 + (value * strength) / 100);

export const getPhotoQualityFilter = (settings?: PhotoQualitySettings | null) => {
  const value = normalizePhotoQualitySettings(settings);
  if (!value.enabled) return 'none';

  const saturation = ratio(value.saturation + value.colorfulness * 0.65);
  const brightness = ratio(value.brightness);
  const contrast = ratio(value.contrast + value.sharpness * 0.18);
  const warmth = value.warmth;
  const sepia = Math.abs(warmth) / 500;
  const hueRotate = warmth >= 0 ? warmth * -0.12 : Math.abs(warmth) * 0.2;

  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturation.toFixed(3)})`,
    `sepia(${sepia.toFixed(3)})`,
    `hue-rotate(${hueRotate.toFixed(1)}deg)`
  ].join(' ');
};

