export type CatalogDesignExport = {
  theme?: 'light' | 'dark';
  backgroundColor?: string;
  backgroundGradientFrom?: string;
  backgroundGradientTo?: string;
  primaryColor?: string;
  accentColor?: string;
  cardColor?: string;
  productCardColor?: string;
  productCardTextColor?: string;
  settingsCardColor?: string;
  settingsCardTextColor?: string;
  cartPanelColor?: string;
  cartPanelTextColor?: string;
  cardStyle?: 'light' | 'dark';
  textColor?: string;
  mutedTextColor?: string;
  productTitleColor?: string;
  categoryTitleColor?: string;
  radius?: number;
};
export type CatalogBackupPayload = {
  restaurant?: Restaurant;
  categories?: Category[];
  cabins?: Cabin[];
  tags?: CatalogTag[];
  products?: Product[];
  design?: CatalogDesignExport;
  theme?: ThemeSettings;
};
export type StockTargets = Record<string, number>;
type BackupImageField = {
  owner: 'restaurant' | 'category' | 'cabin' | 'product' | 'theme';
  id: string;
  field: 'logo_url' | 'banner_url' | 'image' | 'image_url' | 'background_image_url';
};

export const defaultTags: CatalogTag[] = [
  { id: 'hit', name: 'Хит', icon: '🔥', color: '#ef4444' },
  { id: 'popular', name: 'Популярное', icon: '⭐', color: '#f59e0b' },
  { id: 'new', name: 'Новинка', icon: 'NEW', color: '#38bdf8' },
  { id: 'vegetarian', name: 'Вегетарианское', icon: '🌿', color: '#22c55e' }
];

export const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const stockTargetsStorageKey = 'mangal-stock-targets';

export const getCurrentStock = (product: Product) => product.current_stock ?? product.stock_count ?? 0;
export const getDailyStock = (product: Product) => product.daily_stock ?? product.stock_count ?? 0;
export const isLimitedProduct = (product: Product) => !product.is_unlimited;
export const applyStockValues = (product: Product, dailyStock: number, currentStock = dailyStock): Product => ({
  ...product,
  daily_stock: dailyStock,
  current_stock: currentStock,
  stock_count: currentStock,
  is_unlimited: product.is_unlimited ?? false
});

export const playCartSound = (direction: 'add' | 'remove') => {
  try {
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = direction === 'add' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(direction === 'add' ? 520 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(direction === 'add' ? 780 : 190, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(direction === 'add' ? 0.09 : 0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
    oscillator.addEventListener('ended', () => void audioContext.close(), { once: true });
  } catch {
    // Cart updates must remain usable when browser audio is unavailable.
  }
};

export const playAddSound = () => playCartSound('add');

export const getProductCategoryIds = (product: Product) =>
  product.category_ids?.length ? product.category_ids : [product.category_id];

export const isProductInCategory = (product: Product, categoryId: string) =>
  getProductCategoryIds(product).includes(categoryId);

export const getOrderFlowCategories = (categories: Category[]) =>
  categories.filter((category) => category.kind !== 'space' && category.showInOrderFlow === true);

export const createCategoryDraft = (name = 'Новая категория'): Category => {
  const id = makeId('category');
  return {
    id,
    slug: id,
    name,
    icon: 'flame',
    kind: 'food',
    showOnHome: true,
    showInOrderFlow: false,
    image: demoCategories[0]?.image ?? ''
  };
};

export const createTagDraft = (name = 'Новая метка'): CatalogTag => {
  const id = makeId('tag');
  return {
    id,
    slug: id,
    name,
    icon: '#',
    color: '#7c3aed'
  };
};

export type CabinMeta = {
  status: 'active' | 'inactive';
  type: 'normal' | 'vip' | 'premium';
};

export const defaultCabinMeta: CabinMeta = { status: 'active', type: 'normal' };

export const parseCabinMeta = (feature?: string): CabinMeta => {
  if (!feature) return defaultCabinMeta;
  try {
    const parsed = JSON.parse(feature) as Partial<CabinMeta>;
    return {
      status: parsed.status === 'inactive' ? 'inactive' : 'active',
      type: parsed.type === 'vip' || parsed.type === 'premium' ? parsed.type : 'normal'
    };
  } catch {
    return defaultCabinMeta;
  }
};

export const makeCabinFeature = (meta: CabinMeta) => JSON.stringify(meta);

export const createCabinDraft = (): Cabin => ({
  id: makeId('cabin'),
  title: '',
  capacity: '',
  feature: makeCabinFeature(defaultCabinMeta),
  image_url: ''
});

export const makeLoadingRestaurant = (catalogSlug: string): Restaurant => ({
  ...demoRestaurant,
  id: catalogSlug,
  name: catalogSlug === 'mangal' ? demoRestaurant.name : '',
  subtitle: catalogSlug === 'mangal' ? demoRestaurant.subtitle : '',
  logo_url: '',
  banner_url: catalogSlug === 'mangal' ? demoRestaurant.banner_url : '',
  banner_urls: catalogSlug === 'mangal' ? [demoRestaurant.banner_url] : []
});

export const loadStockTargets = (): StockTargets => {
  try {
    return JSON.parse(localStorage.getItem(stockTargetsStorageKey) ?? '{}') as StockTargets;
  } catch {
    return {};
  }
};

export const saveStockTargets = (targets: StockTargets) => {
  try {
    localStorage.setItem(stockTargetsStorageKey, JSON.stringify(targets));
  } catch {
    // Local storage can be unavailable in strict/private browser modes.
  }
};

export const createCatalogBackupPayload = ({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme
}: Required<Pick<CatalogBackupPayload, 'restaurant' | 'categories' | 'cabins' | 'tags' | 'products' | 'theme'>>): CatalogBackupPayload => ({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme,
  design: {
    theme: theme.background_color === '#f7f3ec' ? 'light' : 'dark',
    backgroundColor: theme.background_color,
    backgroundGradientFrom: theme.background_gradient_from,
    backgroundGradientTo: theme.background_gradient_to,
    primaryColor: theme.accent_color,
    accentColor: theme.accent_secondary,
    cardColor: theme.card_color,
    productCardColor: theme.product_card_color,
    productCardTextColor: theme.product_card_text_color,
    settingsCardColor: theme.settings_card_color,
    settingsCardTextColor: theme.settings_card_text_color,
    cartPanelColor: theme.cart_panel_color,
    cartPanelTextColor: theme.cart_panel_text_color,
    cardStyle: theme.card_color === '#ffffff' ? 'light' : 'dark',
    textColor: theme.text_primary,
    mutedTextColor: theme.text_secondary,
    productTitleColor: theme.product_title_color,
    categoryTitleColor: theme.category_title_color,
    radius: theme.card_radius
  }
});

const getDataUrlParts = (value: string) => {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
};

const extensionForMime = (mime: string) => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'bin';
};

const addBackupAsset = (
  zip: JSZip,
  field: BackupImageField,
  value: string,
  assetIndex: number
) => {
  const dataUrl = getDataUrlParts(value);
  if (!dataUrl) return value;

  const filename = `assets/${field.owner}-${field.id}-${field.field}-${assetIndex}.${extensionForMime(dataUrl.mime)}`;
  zip.file(filename, dataUrl.data, { base64: true });
  return filename;
};

const fileToDataUrl = async (file: JSZip.JSZipObject) => {
  const blob = await file.async('blob');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const restoreBackupAsset = async (zip: JSZip, value?: string) => {
  if (!value || !value.startsWith('assets/')) return value;
  const file = zip.file(value);
  return file ? fileToDataUrl(file) : value;
};

export const readCatalogBackupFile = async (file: File): Promise<CatalogBackupPayload> => {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const catalogFile = zip.file('catalog.json') ?? zip.file('mangal-catalog.json');
    if (!catalogFile) {
      throw new Error('В ZIP не найден catalog.json.');
    }

    const payload = JSON.parse(await catalogFile.async('string')) as CatalogBackupPayload;

    if (payload.restaurant) {
      payload.restaurant = {
        ...payload.restaurant,
        logo_url: (await restoreBackupAsset(zip, payload.restaurant.logo_url)) ?? '',
        banner_url: (await restoreBackupAsset(zip, payload.restaurant.banner_url)) ?? ''
      };
    }
    if (payload.categories) {
      payload.categories = await Promise.all(
        payload.categories.map(async (category) => ({
          ...category,
          image: (await restoreBackupAsset(zip, category.image)) ?? ''
        }))
      );
    }
    if (payload.cabins) {
      payload.cabins = await Promise.all(
        payload.cabins.map(async (cabin) => ({
          ...cabin,
          image_url: (await restoreBackupAsset(zip, cabin.image_url)) ?? ''
        }))
      );
    }
    if (payload.products) {
      payload.products = await Promise.all(
        payload.products.map(async (product) => ({
          ...product,
          image_url: (await restoreBackupAsset(zip, product.image_url)) ?? ''
        }))
      );
    }
    if (payload.theme) {
      payload.theme = {
        ...payload.theme,
        background_image_url: (await restoreBackupAsset(zip, payload.theme.background_image_url)) ?? ''
      };
    }

    return payload;
  }

  return JSON.parse(await file.text()) as CatalogBackupPayload;
};

export const downloadCatalogZip = async (payload: CatalogBackupPayload) => {
  const zip = new JSZip();
  const catalog = structuredClone(payload);
  let assetIndex = 0;

  if (catalog.restaurant) {
    catalog.restaurant.logo_url = addBackupAsset(zip, { owner: 'restaurant', id: catalog.restaurant.id, field: 'logo_url' }, catalog.restaurant.logo_url, assetIndex++);
    catalog.restaurant.banner_url = addBackupAsset(zip, { owner: 'restaurant', id: catalog.restaurant.id, field: 'banner_url' }, catalog.restaurant.banner_url, assetIndex++);
  }
  catalog.categories = catalog.categories?.map((category) => ({
    ...category,
    image: addBackupAsset(zip, { owner: 'category', id: category.id, field: 'image' }, category.image, assetIndex++)
  }));
  catalog.cabins = catalog.cabins?.map((cabin) => ({
    ...cabin,
    image_url: addBackupAsset(zip, { owner: 'cabin', id: cabin.id, field: 'image_url' }, cabin.image_url, assetIndex++)
  }));
  catalog.products = catalog.products?.map((product) => ({
    ...product,
    image_url: addBackupAsset(zip, { owner: 'product', id: product.id, field: 'image_url' }, product.image_url, assetIndex++)
  }));
  if (catalog.theme) {
    catalog.theme.background_image_url = addBackupAsset(zip, { owner: 'theme', id: catalog.theme.id, field: 'background_image_url' }, catalog.theme.background_image_url, assetIndex++);
  }

  zip.file('catalog.json', JSON.stringify(catalog, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `catalogg-catalog-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);
};
import JSZip from 'jszip';
import {
  categories as demoCategories,
  restaurant as demoRestaurant
} from '../../data/catalog';
import type {
  Cabin,
  CatalogTag,
  Category,
  Product,
  Restaurant,
  ThemeSettings
} from '../../entities/models';
