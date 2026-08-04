import {
  CloudUpload,
  CreditCard,
  LogOut,
  Paintbrush,
  Armchair,
  Tags,
  Truck,
  User
} from 'lucide-react';

export function SettingsHub({
  onProfile,
  onDesign,
  onCategories,
  onSeating,
  onPayments,
  onImport,
  onDelivery,
  onLogout
}: {
  onProfile: () => void;
  onDesign: () => void;
  onCategories: () => void;
  onSeating?: () => void;
  onPayments: () => void;
  onImport: () => void;
  onDelivery: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="admin-section-card restaurant-settings-hub">
      <h2>Настройки ресторана</h2>
      <div className="restaurant-settings-tiles">
        <button type="button" onClick={onProfile}><User /><span>Профиль</span></button>
        <button type="button" onClick={onDesign}><Paintbrush /><span>Дизайн</span></button>
        <button type="button" onClick={onCategories}><Tags /><span>Категории</span></button>
        {onSeating && <button type="button" onClick={onSeating}><Armchair /><span>Столики и кабинки</span></button>}
        <button type="button" onClick={onPayments}><CreditCard /><span>Платежи</span></button>
        <button type="button" onClick={onImport}><CloudUpload /><span>Импорт</span></button>
        <button type="button" onClick={onDelivery}><Truck /><span>Доставка и заказы</span></button>
        <button className="is-danger" type="button" onClick={onLogout}><LogOut /><span>Выход</span></button>
      </div>
    </section>
  );
}
