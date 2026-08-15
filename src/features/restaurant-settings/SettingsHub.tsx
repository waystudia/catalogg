import {
  CloudUpload,
  CreditCard,
  KeyRound,
  LogOut,
  Paintbrush,
  Armchair,
  ShieldCheck,
  Tags,
  Truck,
  User
} from 'lucide-react';
import type { RestaurantLegalStatus } from '../restaurant-activation/restaurantActivation';
import { getBusinessTerms, type BusinessType } from '../../shared/businessTerminology';

export function SettingsHub({
  onProfile,
  onDesign,
  onCategories,
  onSeating,
  onPayments,
  onImport,
  onDelivery,
  onLogout,
  onPassword,
  onActivate,
  activationStatus,
  workspaceLinks,
  businessType = 'restaurant'
}: {
  onProfile: () => void;
  onDesign: () => void;
  onCategories: () => void;
  onSeating?: () => void;
  onPayments: () => void;
  onImport: () => void;
  onDelivery: () => void;
  onLogout: () => void;
  onPassword?: () => void;
  onActivate?: () => void;
  activationStatus?: RestaurantLegalStatus | null;
  workspaceLinks?: Array<{
    label: string;
    icon: typeof User;
    onClick: () => void;
  }>;
  businessType?: BusinessType;
}) {
  const terms = getBusinessTerms(businessType);
  return (
    <section className="admin-section-card restaurant-settings-hub" aria-label={`Настройки ${terms.placeGenitive}`}>
      <h2>Настройки {terms.placeGenitive}</h2>
      {onActivate && activationStatus && activationStatus !== 'active' && (
        <div className="restaurant-settings-activation">
          <ShieldCheck />
          <div>
            <strong>{terms.place} работает в тестовом режиме</strong>
            <small>Проверьте каталог и настройки, затем завершите юридическое подключение.</small>
          </div>
          <button type="button" onClick={onActivate}>Активировать {terms.placeAccusative}</button>
        </div>
      )}
      {workspaceLinks && workspaceLinks.length > 0 && (
        <section className="restaurant-settings-workspace" aria-label={`Разделы ${terms.placeGenitive}`}>
          <h3>Разделы {terms.placeGenitive}</h3>
          <div className="restaurant-settings-tiles">
            {workspaceLinks.map(({ label, icon: Icon, onClick }) => (
              <button type="button" onClick={onClick} key={label}><Icon /><span>{label}</span></button>
            ))}
          </div>
        </section>
      )}
      <div className="restaurant-settings-tiles">
        <button type="button" onClick={onProfile}><User /><span>Профиль</span></button>
        <button type="button" onClick={onDesign}><Paintbrush /><span>Дизайн</span></button>
        <button type="button" onClick={onCategories}><Tags /><span>Категории</span></button>
        {onSeating && <button type="button" onClick={onSeating}><Armchair /><span>Зал</span></button>}
        <button type="button" onClick={onPayments}><CreditCard /><span>Платежи</span></button>
        <button type="button" onClick={onImport}><CloudUpload /><span>Импорт / Экспорт</span></button>
        <button type="button" onClick={onDelivery}><Truck /><span>Доставка и заказы</span></button>
        {onPassword && <button type="button" onClick={onPassword}><KeyRound /><span>Сменить пароль</span></button>}
        <button className="is-danger" type="button" onClick={onLogout}><LogOut /><span>Выход</span></button>
      </div>
    </section>
  );
}
