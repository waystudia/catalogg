import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import type { RestaurantDeliverySettings } from '../../shared/api/restaurantOrdersApi';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import type { PhotoQualitySettings } from '../../shared/photoQuality';
import { DesignSettingsHome, PhotoQualitySettingsScreen, ThemeSettingsScreen } from '../design-settings';
import { BackupSettings, CategoriesSettings, DeliverySettingsCard, PaymentSettingsCard, ProfileSettings, SettingsHub } from '../restaurant-settings';
import type { CatalogBackupPayload } from '../restaurant-settings/catalogAdminModel';
import type { RestaurantLegalStatus } from '../restaurant-activation/restaurantActivation';
import type { BusinessType } from '../../shared/businessTerminology';
import type { LucideIcon } from 'lucide-react';
import { useBrowserBackedState } from '../../shared/useBrowserBackedState';

export type ExistingRestaurantSettingsView = 'home' | 'profile' | 'design' | 'theme' | 'photo-quality' | 'categories' | 'payments' | 'backup' | 'delivery';

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
  legalActivationStatus,
  workspaceLinks,
  businessType = 'restaurant'
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
  workspaceLinks?: Array<{
    label: string;
    icon: LucideIcon;
    onClick: () => void;
  }>;
  businessType?: BusinessType;
}) {
  const [view, viewHistory] = useBrowserBackedState<ExistingRestaurantSettingsView>(`business:${catalogSlug}:settings-view`, initialView);
  const [catalogTab, setCatalogTab] = useState<SettingsCatalogTab>('categories');
  const [categoryEditor, categoryEditorHistory] = useBrowserBackedState<{
    mode: CategoryEditorMode;
    id?: string;
  }>(`business:${catalogSlug}:category-editor`, { mode: 'list' });
  const [cabinEditor, cabinEditorHistory] = useBrowserBackedState<{
    mode: CabinEditorMode;
    id?: string;
  }>(`business:${catalogSlug}:cabin-editor`, { mode: 'list' });

  if (view === 'home') {
    return (
      <SettingsHub
        onProfile={() => viewHistory.open('profile')}
        onDesign={() => viewHistory.open('design')}
        onCategories={() => {
          setCatalogTab('categories');
          viewHistory.open('categories');
        }}
        onSeating={
          businessType === 'restaurant' || businessType === 'coffee_shop'
            ? () => {
                setCatalogTab('cabins');
                cabinEditorHistory.replace({ mode: 'list' });
                viewHistory.open('categories');
              }
            : undefined
        }
        onPayments={() => viewHistory.open('payments')}
        onImport={() => viewHistory.open('backup')}
        onDelivery={() => viewHistory.open('delivery')}
        onLogout={onSignOut}
        onPassword={onChangePassword}
        onActivate={onActivate}
        activationStatus={legalActivationStatus}
        workspaceLinks={workspaceLinks}
        businessType={businessType}
      />
    );
  }

  if (view === 'delivery') {
    return <DeliverySettingsCard businessType={businessType} catalogSlug={catalogSlug} settings={deliverySettings} onSave={onSaveDelivery} onOpenBackup={() => viewHistory.open('backup')} onBack={() => viewHistory.back(() => viewHistory.replace('home'))} />;
  }

  return (
    <section className="existing-restaurant-settings">
      <button
        className="ra-back-button"
        type="button"
        onClick={() => {
          if (view === 'categories' && (categoryEditor.mode !== 'list' || cabinEditor.mode !== 'list')) {
            if (catalogTab === 'cabins') cabinEditorHistory.back(() => cabinEditorHistory.replace({ mode: 'list' }));
            else categoryEditorHistory.back(() => categoryEditorHistory.replace({ mode: 'list' }));
            return;
          }
          viewHistory.back(() => viewHistory.replace('home'));
        }}
      >
        <ArrowLeft />
        Вернуться к настройкам
      </button>

      {view === 'profile' && <ProfileSettings restaurant={restaurant} businessType={businessType} onSave={onSaveRestaurant} />}
      {view === 'design' && <DesignSettingsHome businessType={businessType} onOpenTheme={() => viewHistory.open('theme')} onOpenPhotoQuality={() => viewHistory.open('photo-quality')} />}
      {view === 'theme' && <ThemeSettingsScreen businessType={businessType} theme={theme} onChange={onSaveTheme} />}
      {view === 'photo-quality' && <PhotoQualitySettingsScreen businessType={businessType} products={products} value={photoQuality} onSave={onSavePhotoQuality} />}
      {view === 'categories' && (
        <CategoriesSettings
          categories={categories}
          cabins={cabins}
          tags={tags}
          products={products}
          activeTab={catalogTab}
          onTabChange={(tab) => {
            setCatalogTab(tab);
            categoryEditorHistory.replace({ mode: 'list' });
            cabinEditorHistory.replace({ mode: 'list' });
          }}
          mode={categoryEditor.mode}
          editingId={categoryEditor.id}
          cabinMode={cabinEditor.mode}
          editingCabinId={cabinEditor.id}
          onModeChange={(mode, id) => mode === 'list'
            ? categoryEditorHistory.back(() => categoryEditorHistory.replace({ mode }))
            : categoryEditorHistory.open({ mode, id })}
          onCabinModeChange={(mode, id) => mode === 'list'
            ? cabinEditorHistory.back(() => cabinEditorHistory.replace({ mode }))
            : cabinEditorHistory.open({ mode, id })}
          onChangeCategories={onSaveCategories}
          onChangeCabins={onSaveCabins}
          onChangeTags={onSaveTags}
          businessType={businessType}
        />
      )}
      {view === 'payments' && <PaymentSettingsCard slug={catalogSlug} settings={paymentSettings} businessType={businessType} onSave={onSavePayments} />}
      {view === 'backup' && <BackupSettings businessType={businessType} restaurant={restaurant} categories={categories} cabins={cabins} tags={tags} products={products} theme={theme} onImport={onImport} />}
    </section>
  );
}
