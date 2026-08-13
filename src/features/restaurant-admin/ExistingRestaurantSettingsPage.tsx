import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type {
  Cabin,
  CatalogTag,
  Category,
  Product,
  Restaurant,
  ThemeSettings
} from '../../entities/models';
import type { RestaurantDeliverySettings } from '../../shared/api/restaurantOrdersApi';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import type { PhotoQualitySettings } from '../../shared/photoQuality';
import {
  DesignSettingsHome,
  PhotoQualitySettingsScreen,
  ThemeSettingsScreen
} from '../design-settings';
import {
  BackupSettings,
  CategoriesSettings,
  DeliverySettingsCard,
  PaymentSettingsCard,
  ProfileSettings,
  SettingsHub
} from '../restaurant-settings';
import type { CatalogBackupPayload } from '../restaurant-settings/catalogAdminModel';
import type { RestaurantLegalStatus } from '../restaurant-activation/restaurantActivation';

export type ExistingRestaurantSettingsView =
  | 'home'
  | 'profile'
  | 'design'
  | 'theme'
  | 'photo-quality'
  | 'categories'
  | 'payments'
  | 'backup'
  | 'delivery';

type SettingsCatalogTab = 'tags' | 'cabins' | 'categories';
type CategoryEditorMode = 'list' | 'edit' | 'add';
type CabinEditorMode = 'list' | 'edit' | 'add';

export function ExistingRestaurantSettingsPage({
  initialView = 'home',
  catalogSlug,
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme,
  photoQuality,
  paymentSettings,
  deliverySettings,
  onSaveRestaurant,
  onSaveCategories,
  onSaveCabins,
  onSaveTags,
  onSaveTheme,
  onSavePhotoQuality,
  onSavePayments,
  onSaveDelivery,
  onImport,
  onSignOut,
  onChangePassword,
  onActivate,
  legalActivationStatus
}: {
  initialView?: ExistingRestaurantSettingsView;
  catalogSlug: string;
  restaurant: Restaurant;
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  products: Product[];
  theme: ThemeSettings;
  photoQuality: PhotoQualitySettings;
  paymentSettings: RestaurantPaymentSettings;
  deliverySettings: RestaurantDeliverySettings;
  onSaveRestaurant: (restaurant: Restaurant) => void;
  onSaveCategories: (categories: Category[]) => void;
  onSaveCabins: (cabins: Cabin[]) => void;
  onSaveTags: (tags: CatalogTag[]) => void;
  onSaveTheme: (patch: Partial<ThemeSettings>) => void;
  onSavePhotoQuality: (settings: PhotoQualitySettings) => Promise<void>;
  onSavePayments: (settings: RestaurantPaymentSettings) => void;
  onSaveDelivery: (settings: RestaurantDeliverySettings) => void;
  onImport: (payload: CatalogBackupPayload) => void;
  onSignOut: () => void;
  onChangePassword?: () => void;
  onActivate?: () => void;
  legalActivationStatus?: RestaurantLegalStatus | null;
}) {
  const [view, setView] = useState<ExistingRestaurantSettingsView>(initialView);
  const [catalogTab, setCatalogTab] = useState<SettingsCatalogTab>('categories');
  const [categoryEditor, setCategoryEditor] = useState<{ mode: CategoryEditorMode; id?: string }>({ mode: 'list' });
  const [cabinEditor, setCabinEditor] = useState<{ mode: CabinEditorMode; id?: string }>({ mode: 'list' });

  if (view === 'home') {
    return (
      <SettingsHub
        onProfile={() => setView('profile')}
        onDesign={() => setView('design')}
        onCategories={() => {
          setCatalogTab('categories');
          setView('categories');
        }}
        onSeating={() => {
          setCatalogTab('cabins');
          setCabinEditor({ mode: 'list' });
          setView('categories');
        }}
        onPayments={() => setView('payments')}
        onImport={() => setView('backup')}
        onDelivery={() => setView('delivery')}
        onLogout={onSignOut}
        onPassword={onChangePassword}
        onActivate={onActivate}
        activationStatus={legalActivationStatus}
      />
    );
  }

  if (view === 'delivery') {
    return (
      <DeliverySettingsCard
        catalogSlug={catalogSlug}
        settings={deliverySettings}
        onSave={onSaveDelivery}
        onOpenBackup={() => setView('backup')}
        onBack={() => setView('home')}
      />
    );
  }

  return (
    <section className="existing-restaurant-settings">
      <button className="ra-back-button" type="button" onClick={() => {
        if (view === 'theme' || view === 'photo-quality') {
          setView('design');
          return;
        }
        setView('home');
      }}>
        <ArrowLeft />
        Вернуться к настройкам
      </button>

      {view === 'profile' && <ProfileSettings restaurant={restaurant} onSave={onSaveRestaurant} />}
      {view === 'design' && (
        <DesignSettingsHome
          onOpenTheme={() => setView('theme')}
          onOpenPhotoQuality={() => setView('photo-quality')}
        />
      )}
      {view === 'theme' && <ThemeSettingsScreen theme={theme} onChange={onSaveTheme} />}
      {view === 'photo-quality' && (
        <PhotoQualitySettingsScreen products={products} value={photoQuality} onSave={onSavePhotoQuality} />
      )}
      {view === 'categories' && (
        <CategoriesSettings
          categories={categories}
          cabins={cabins}
          tags={tags}
          products={products}
          activeTab={catalogTab}
          onTabChange={(tab) => {
            setCatalogTab(tab);
            setCategoryEditor({ mode: 'list' });
            setCabinEditor({ mode: 'list' });
          }}
          mode={categoryEditor.mode}
          editingId={categoryEditor.id}
          cabinMode={cabinEditor.mode}
          editingCabinId={cabinEditor.id}
          onModeChange={(mode, id) => setCategoryEditor({ mode, id })}
          onCabinModeChange={(mode, id) => setCabinEditor({ mode, id })}
          onChangeCategories={onSaveCategories}
          onChangeCabins={onSaveCabins}
          onChangeTags={onSaveTags}
        />
      )}
      {view === 'payments' && (
        <PaymentSettingsCard slug={catalogSlug} settings={paymentSettings} onSave={onSavePayments} />
      )}
      {view === 'backup' && (
        <BackupSettings
          restaurant={restaurant}
          categories={categories}
          cabins={cabins}
          tags={tags}
          products={products}
          theme={theme}
          onImport={onImport}
        />
      )}
    </section>
  );
}
