import { useState } from 'react';
import { cabins, categories, products, restaurant } from '../../data/catalog';
import { groceryCategories, groceryProducts, groceryRestaurant } from '../../data/groceryCatalog';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { defaultPaymentSettings } from '../../shared/paymentSettings';
import { defaultRestaurantDeliverySettings } from '../restaurant-settings';
import { RestaurantAdminWorkspace } from './RestaurantAdminWorkspace';

const previewOrder: RestaurantOrder = {
  id: 'preview-order-9584',
  orderNumber: 'M9584',
  catalogId: 'mangal',
  clientName: 'Адам Мусаев',
  clientPhone: '+7 928 000-00-00',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: 'Курчалой, ул. Центральная, 18',
  deliveryLat: 43.318123,
  deliveryLng: 45.698456,
  clientAccuracyM: 8,
  deliveryCity: 'Курчалой',
  deliverySettlement: 'Курчалой',
  restaurantAddress: 'Курчалой, ул. А-Х. Кадырова, 31',
  restaurantCity: 'Курчалой',
  restaurantLat: 43.322,
  restaurantLng: 45.705,
  comment: '[payment_method:cash]\nПозвонить за пять минут до приезда',
  status: 'waiting_driver',
  paymentStatus: 'unpaid',
  deliveryStatus: 'assigned',
  deliveryId: 'preview-delivery-9584',
  deliveryUpdatedAt: '2026-08-14T17:43:00.000Z',
  driverName: 'Магомед Алиев',
  driverPhone: '+7 928 111-11-11',
  driverVehicleInfo: 'Lada Granta, белая',
  driverCarNumber: 'А001АА95',
  driverPhotoUrl: null,
  driverLat: 43.319,
  driverLng: 45.699,
  driverLocationAt: '2026-08-14T17:43:00.000Z',
  restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null,
  subtotal: 1_160,
  deliveryFee: 200,
  courierPayout: 200,
  total: 1_360,
  createdAt: '2026-08-14T17:40:00.000Z',
  acceptedAt: '2026-08-14T17:41:00.000Z',
  readyAt: '2026-08-14T17:42:00.000Z',
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [
    {
      id: 'preview-item-1',
      title: 'Шашлык из баранины',
      quantity: 2,
      unitPrice: 480,
      lineTotal: 960
    },
    {
      id: 'preview-item-2',
      title: 'Лепёшка',
      quantity: 2,
      unitPrice: 100,
      lineTotal: 200
    }
  ]
};

const groceryPreviewOrder: RestaurantOrder = {
  ...previewOrder,
  id: 'preview-grocery-order-8042',
  orderNumber: 'F8042',
  catalogId: 'finik',
  clientName: 'Марьям Исаева',
  comment: '[payment_method:cash]\nЕсли товара нет, предложить замену в чате',
  status: 'new',
  subtotal: 1_113,
  total: 1_313,
  readyAt: null,
  items: [
    {
      id: 'preview-grocery-item-1',
      productId: groceryProducts[0].id,
      title: groceryProducts[0].title,
      quantity: 1,
      unitPrice: groceryProducts[0].price,
      lineTotal: 893,
      saleUnit: 'weight',
      quantityUnit: 'gram',
      requestedQuantity: 750,
      fulfilledQuantity: 0,
      fulfillmentState: 'pending'
    },
    {
      id: 'preview-grocery-item-2',
      productId: groceryProducts[16].id,
      title: groceryProducts[16].title,
      quantity: 2,
      unitPrice: groceryProducts[16].price,
      lineTotal: 220,
      saleUnit: 'piece',
      quantityUnit: 'piece',
      requestedQuantity: 2,
      fulfilledQuantity: 0,
      fulfillmentState: 'pending'
    }
  ]
};

export function RestaurantAdminPreview() {
  const [businessMode, setBusinessMode] = useState<'restaurant' | 'grocery'>('restaurant');
  const [ordersByMode, setOrdersByMode] = useState({
    restaurant: [previewOrder],
    grocery: [groceryPreviewOrder]
  });
  const isGrocery = businessMode === 'grocery';
  const orders = ordersByMode[businessMode];

  const updateStatus = async (order: RestaurantOrder, status: RestaurantOrderStatus) => {
    setOrdersByMode((current) => ({
      ...current,
      [businessMode]: current[businessMode].map((item) => (item.id === order.id ? { ...item, status } : item))
    }));
  };

  return (
    <>
      <nav className="restaurant-admin-preview-switcher" aria-label="Тип тестового бизнеса">
        <button type="button" data-active={!isGrocery} onClick={() => setBusinessMode('restaurant')}>
          Ресторан
        </button>
        <button type="button" data-active={isGrocery} onClick={() => setBusinessMode('grocery')}>
          Продуктовый магазин
        </button>
      </nav>
      <RestaurantAdminWorkspace
        key={businessMode}
        catalogSlug={isGrocery ? 'finik' : 'mangal'}
        restaurant={isGrocery ? groceryRestaurant : restaurant}
        categories={isGrocery ? groceryCategories : categories}
        cabins={isGrocery ? [] : cabins}
        products={isGrocery ? groceryProducts : products}
        orders={orders}
        routeSection="orders"
        paymentSettings={defaultPaymentSettings}
        deliverySettings={defaultRestaurantDeliverySettings}
        moduleAccess={{ pos: 'active', warehouse: isGrocery ? 'active' : 'disabled' }}
        onOpenScreen={() => undefined}
        onOpenSeating={() => undefined}
        onOpenCatalog={() => undefined}
        onAddDish={() => undefined}
        onOrderStatus={updateStatus}
        onRefreshOrders={() => undefined}
        onSaveDeliverySettings={() => undefined}
      />
    </>
  );
}
