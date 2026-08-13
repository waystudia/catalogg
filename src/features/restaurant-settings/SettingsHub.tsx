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
  activationStatus
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
}) {
  return (
    <section className="admin-section-card restaurant-settings-hub">
      <h2>Настройки ресторана</h2>
      {onActivate && activationStatus && activationStatus !== 'active' && (
        <div className="restaurant-settings-activation">
          <ShieldCheck />
          <div>
            <strong>Ресторан работает в тестовом режиме</strong>
            <small>Проверьте меню и настройки, затем завершите юридическое подключение.</small>
          </div>
          <button type="button" onClick={onActivate}>Активировать ресторан</button>
        </div>
      )}
      <div className="restaurant-settings-tiles">
        <button type="button" onClick={onProfile}><User /><span>Профиль</span></button>
        <button type="button" onClick={onDesign}><Paintbrush /><span>Дизайн</span></button>
        <button type="button" onClick={onCategories}><Tags /><span>Категории</span></button>
        {onSeating && <button type="button" onClick={onSeating}><Armchair /><span>Зал</span></button>}
        <button type="button" onClick={onPayments}><CreditCard /><span>Платежи</span></button>
        <button type="button" onClick={onImport}><CloudUpload /><span>Импорт</span></button>
        <button type="button" onClick={onDelivery}><Truck /><span>Доставка и заказы</span></button>
        {onPassword && <button type="button" onClick={onPassword}><KeyRound /><span>Сменить пароль</span></button>}
        <button className="is-danger" type="button" onClick={onLogout}><LogOut /><span>Выход</span></button>
      </div>
    </section>
  );
}
