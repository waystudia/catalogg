import { ClipboardList, PackageOpen, Truck } from 'lucide-react';
import type { RestaurantModuleAccessMode } from '../platform-admin-modules/restaurantModuleAccess';

export function RestaurantWarehousePage({
  restaurantName,
  accessMode,
  onAddProduct
}: {
  restaurantName: string;
  accessMode: RestaurantModuleAccessMode;
  onAddProduct?: () => void;
}) {
  return (
    <div className="restaurant-warehouse-page ra-page-stack">
      <header className="restaurant-pos-page__header">
        <div>
          <h2>Склад — Остатки</h2>
          <p>Склад подключён к существующему ресторану «{restaurantName}»</p>
        </div>
        {accessMode === 'read_only' && <strong>Подписка закончилась — доступен только просмотр</strong>}
      </header>
      <nav className="restaurant-warehouse-tabs" aria-label="Разделы склада">
        <button type="button" data-active="true">Остатки</button>
        <button type="button">Приходы</button>
        <button type="button">Расходы</button>
        <button type="button">Инвентаризация</button>
        <button type="button">Поставщики</button>
      </nav>
      <section className="restaurant-warehouse-empty">
        <PackageOpen />
        <h3>Складских продуктов пока нет</h3>
        <p>Каталог блюд сохранён без изменений. Складские продукты и ингредиенты будут храниться отдельно и связываться с существующими блюдами.</p>
        <div>
          <span><ClipboardList />Техкарты не затрагивают карточки каталога</span>
          <span><Truck />Приходы и списания идут отдельными движениями</span>
        </div>
        <button type="button" disabled={accessMode !== 'active' || !onAddProduct} onClick={onAddProduct}>Добавить первый продукт</button>
      </section>
    </div>
  );
}
