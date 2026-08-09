import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('restaurant order action contract', () => {
  it('uses the canonical canceled enum value and waits for persistence before closing the new state', async () => {
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const migration = await read('supabase/migrations/20260730183205_secure_restaurant_order_status_actions.sql');

    assert.match(api, /status === 'cancelled' \? 'canceled' : status/);
    assert.match(api, /rpc\('update_restaurant_order_status'/);
    assert.match(migration, /create or replace function public\.update_restaurant_order_status/);
    assert.match(migration, /client\.owner_user_id = auth\.uid\(\)/);
    assert.match(migration, /insert into public\.order_status_history/);
    assert.match(panel, /onStatus: .*Promise<void>/);
    assert.match(panel, /await onStatus\('canceled', 'restaurant_rejected'\)/);
    assert.match(panel, /isRejecting/);
  });

  it('shows the restaurant cash-payment gate before allowing QR verification', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const driver = await read('src/pages/driver/DriverApp.tsx');

    assert.match(api, /confirmRestaurantCashPayment/);
    assert.match(api, /rpc\('confirm_restaurant_cash_payment'/);
    assert.match(panel, /Подтвердить получение наличных/);
    assert.match(panel, /До подтверждения водитель не сможет нажать «Забрал заказ»/);
    assert.match(panel, /водитель должен нажать «Я в ресторане»/);
    assert.match(panel, /disabled=\{!driverAtRestaurant \|\| isConfirmingCash\}/);
    assert.doesNotMatch(panel, /orderPaymentMethod === 'cash' && driverAtRestaurant/);
    assert.match(panel, /Оплата подтверждена — отсканируйте QR водителя/);
    assert.match(driver, /pickupBlocked = waitingForCashConfirmation \|\| waitingForQr/);
    assert.match(driver, /Я передал деньги/);
    assert.match(driver, /Ожидайте подтверждения оплаты \$\{terms\.placeInstrumental\}/);
    assert.match(driver, /После подтверждения \{terms\.placeInstrumental\} появится QR/);
  });

  it('opens payment controls from the payment card and keeps the overflow menu for order actions', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const menuStart = panel.indexOf('<details className="admin-order-more">');
    const menuEnd = panel.indexOf('</details>', menuStart);
    const overflowMenu = panel.slice(menuStart, menuEnd);

    assert.match(panel, /className="admin-order-payment-card"/);
    assert.match(panel, /aria-expanded=\{isPaymentPanelOpen\}/);
    assert.match(panel, /isPaymentPanelOpen &&/);
    assert.match(panel, /id="admin-order-payment-panel"/);
    assert.match(panel, /Нажмите, чтобы подтвердить получение наличных/);
    assert.doesNotMatch(overflowMenu, /Ожидает подтверждения|Подтвердить оплату|Отклонить оплату/);
    assert.match(overflowMenu, /Отменить заказ/);
    assert.match(overflowMenu, /Удалить заказ/);
  });

  it('lets an authenticated restaurant irreversibly delete only test orders', async () => {
    const workspace = await read('src/features/restaurant-admin/RestaurantAdminWorkspace.tsx');
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const catalogShell = await read('src/pages/catalog-admin/RestaurantAdminShell.tsx');
    const app = await read('src/app/App.tsx');
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const migration = await read('supabase/migrations/20260730234824_development_delete_restaurant_order.sql');
    const restriction = await read('supabase/migrations/20260803195140_restrict_restaurant_order_deletion.sql');
    const testOrderRestriction = await read('supabase/migrations/20260809090226_restaurant_preactivation_test_catalogs.sql');

    assert.doesNotMatch(app, /onOrderDelete=\{\(order\) => changeOrderStatus\(order, 'cancelled'/);
    assert.match(workspace, /const deleteOrder = async \(order: RestaurantOrder\)/);
    assert.match(workspace, /deleteRestaurantTestOrder\(order\)/);
    assert.match(workspace, /onDelete=\{\(\) => deleteOrder\(selectedVisibleOrder\)\}/);
    assert.match(panel, /onDelete: \(\) => Promise<void>/);
    assert.match(panel, /await onDelete\(\)/);
    assert.match(panel, /order\.isTestOrder &&/);
    assert.match(panel, /Удалить заказ/);
    assert.match(panel, /Это действие нельзя отменить/);
    assert.match(api, /rpc\('delete_restaurant_test_order'/);
    assert.match(migration, /public\.is_catalog_member/);
    assert.match(migration, /client\.owner_user_id = auth\.uid\(\)/);
    assert.match(migration, /revoke all on function public\.delete_restaurant_test_order\(uuid, uuid\) from public, anon/);
    assert.match(restriction, /revoke all on function public\.delete_restaurant_test_order\(uuid, uuid\) from public, anon, service_role/);
    assert.match(restriction, /grant execute on function public\.delete_restaurant_test_order\(uuid, uuid\) to authenticated/);
    assert.match(testOrderRestriction, /and is_test_order is true/);
    assert.match(catalogShell, /deleteRestaurantTestOrder/);
    assert.match(catalogShell, /const deleteOrder = async \(order: RestaurantOrder\)/);
    assert.match(catalogShell, /const deleted = await deleteRestaurantTestOrder\(order\)/);
    assert.match(catalogShell, /if \(!deleted\) throw new Error\('Заказ уже удалён или не найден'\)/);
    assert.match(catalogShell, /setOrders\(\(current\) => current\.filter\(\(item\) => item\.id !== order\.id\)\)/);
    assert.match(catalogShell, /onDelete=\{deleteOrder\}/);
    assert.match(catalogShell, /await onDelete\(order\)/);
    assert.match(catalogShell, /order\.isTestOrder &&/);
    assert.match(catalogShell, /Удалить тестовый заказ\? Это действие нельзя отменить\./);
    assert.match(catalogShell, /if \(isDeleting \|\| !window\.confirm\('Удалить тестовый заказ\? Это действие нельзя отменить\.'\)\) return/);
    assert.match(catalogShell, /disabled=\{isDeleting\}/);
    assert.match(catalogShell, /isDeleting \? 'Удаляем\.\.\.' : 'Удалить заказ'/);
    assert.doesNotMatch(catalogShell, /Удалить заказ из работы ресторана\?/);
  });

  it('shows a confirmed trash action only on test restaurant order cards', async () => {
    const workspace = await read('src/features/restaurant-admin/RestaurantAdminWorkspace.tsx');

    assert.match(workspace, /group\.orders\.map\(\(order\) => \(/);
    assert.match(workspace, /order\.isTestOrder &&/);
    assert.match(workspace, /className="admin-order-card__delete"/);
    assert.match(workspace, /aria-label=\{`Удалить заказ \$\{order\.orderNumber\}`\}/);
    assert.match(workspace, /window\.confirm\(`Удалить тестовый заказ #\$\{order\.orderNumber\} безвозвратно\?`\)/);
    assert.match(workspace, /disabled=\{deletingOrderId === order\.id\}/);
    assert.match(workspace, /void deleteOrder\(order\)/);
    assert.doesNotMatch(workspace, /import\.meta\.env\.DEV && \(/);
  });

  it('keeps the assigned driver card visible throughout the restaurant order lifecycle', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const styles = await read('src/app/styles.css');

    assert.match(panel, /order\.driverName && \(/);
    assert.match(panel, /admin-order-person-cards/);
    assert.match(panel, /admin-order-person-card/);
    assert.match(panel, /Данные клиента/);
    assert.match(panel, /Данные водителя/);
    assert.match(panel, /Заказ принял водитель/);
    assert.match(panel, /order\.driverPhone/);
    assert.match(panel, /order\.driverVehicleInfo/);
    assert.match(panel, /order\.driverCarNumber/);
    assert.match(panel, /order\.driverPhotoUrl/);
    assert.match(api, /drivers\(name, phone, vehicle_info, car_number, photo_url,/);
    assert.match(api, /selectRelevantDelivery/);
    assert.match(api, /rpc\('get_restaurant_assigned_drivers'/);
    assert.match(api, /deliveryId: driver\.delivery_id \?\? order\.deliveryId/);
    assert.match(api, /restaurantPaymentConfirmedAt:/);
    assert.match(panel, /Выдача заказа/);
    assert.match(panel, /Ожидает QR водителя/);
    assert.doesNotMatch(panel, /Код подтверждения/);
    assert.match(api, /from\('drivers'\)/);
    assert.match(api, /if \(!driverId \|\| order\.driverName\) return order/);
    assert.match(api, /formatPublicOrderNumber\(row\.id, restaurantNameOrSlug\)/);
    assert.match(styles, /\.admin-order-person-cards/);
    assert.match(styles, /\.admin-order-person-card/);
  });

  it('makes the primary status action visibly await persistence', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');

    assert.match(panel, /isChangingStatus/);
    assert.match(panel, /await onStatus\(nextStatusAction\.status\)/);
    assert.match(panel, /Сохраняем\.\.\./);
    assert.match(panel, /toast\.success\(`Статус: \$\{nextStatusAction\.label\}`\)/);
    assert.match(panel, /toast\.error\(error instanceof Error \? error\.message : 'Не удалось изменить статус заказа'\)/);
  });
});
