import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ClientAddress,
  ClientCartLine,
  ClientCheckoutDraft,
  ClientOrder,
  ClientOrderConsent,
  ClientOrderItem,
  ClientOrderStatus,
  ClientOrderType,
  ClientPaymentMethod,
  ClientPaymentStatus,
  ClientProfile
} from './types';

type ClientPlatformStore = {
  selectedCityId: string;
  recentCityIds: string[];
  profile: ClientProfile;
  orderConsent: ClientOrderConsent | null;
  addresses: ClientAddress[];
  favoriteRestaurantIds: string[];
  favoriteDishIds: string[];
  carts: Record<string, ClientCartLine[]>;
  checkoutDrafts: Record<string, ClientCheckoutDraft>;
  orders: ClientOrder[];
  setSelectedCity: (cityId: string) => void;
  saveProfile: (profile: ClientProfile) => void;
  recordOrderConsent: () => void;
  addAddress: (address: ClientAddress) => void;
  selectDraftAddress: (restaurantSlug: string, address: ClientAddress) => void;
  updateCheckoutDraft: (restaurantSlug: string, patch: Partial<ClientCheckoutDraft>) => void;
  setDraftOrderType: (restaurantSlug: string, orderType: ClientOrderType) => void;
  setDraftPaymentMethod: (restaurantSlug: string, paymentMethod: ClientPaymentMethod) => void;
  addDish: (restaurantSlug: string, dishId: string) => void;
  decrementDish: (restaurantSlug: string, dishId: string) => void;
  removeDish: (restaurantSlug: string, dishId: string) => void;
  clearCart: (restaurantSlug: string) => void;
  submitOrder: (order: ClientOrder) => void;
  syncOrderPatch: (
    orderId: string,
    patch: Partial<Pick<ClientOrder, 'driverName' | 'driverPhone' | 'driverLat' | 'driverLng' | 'driverLocationAt'>> & {
      status?: ClientOrderStatus;
      paymentStatus?: ClientPaymentStatus;
    }
  ) => void;
  repeatOrder: (order: ClientOrder) => void;
  toggleFavoriteRestaurant: (restaurantId: string) => void;
  toggleFavoriteDish: (dishId: string) => void;
};

export const CLIENT_ORDER_CONSENT_VERSION = '1.0';

const defaultDraft = (): ClientCheckoutDraft => ({
  orderType: 'delivery',
  clientName: '',
  clientPhone: '',
  boothName: 'Кабинка №1',
  addressId: '',
  deliverySettlement: '',
  deliveryAddress: '',
  deliveryLat: 43.3184,
  deliveryLng: 45.6927,
  deliveryAccuracyM: 15,
  deliveryEntrance: '',
  deliveryFloor: '',
  deliveryApartment: '',
  deliveryIntercomCode: '',
  deliveryLandmark: '',
  deliveryComment: '',
  paymentMethod: 'qr'
});

const getDraft = (drafts: Record<string, ClientCheckoutDraft>, restaurantSlug: string) =>
  drafts[restaurantSlug] ?? defaultDraft();

const toggleId = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];

const orderItemsToCart = (items: ClientOrderItem[]): ClientCartLine[] =>
  items.map((item) => ({ dishId: item.dishId, quantity: item.quantity }));

const demoProfile: ClientProfile = { name: 'Адам М.', phone: '+7 928 123-45-67' };
const demoOrderId = 'WC-12345';
const demoAddressIds = new Set(['address-home', 'address-work']);
const demoFavoriteRestaurantId = 'restaurant-rizih';
const demoFavoriteDishId = 'rizih-philadelphia';
const demoCartDishIds = new Set(['rizih-philadelphia', 'rizih-four-seasons', 'rizih-pepperoni']);
const demoOrderDishIds = new Set(['rizih-philadelphia', 'rizih-four-seasons', 'rizih-pepperoni']);

const normalizeText = (value: string | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

export const isLegacyDemoClientOrder = (order: ClientOrder) => {
  if (order.id === demoOrderId) return true;

  const itemIds = new Set(order.items.map((item) => item.dishId));
  const hasDemoItems =
    order.items.length === demoOrderDishIds.size &&
    order.items.every((item) => item.quantity === 1 && demoOrderDishIds.has(item.dishId)) &&
    itemIds.size === demoOrderDishIds.size;
  const isDemoDriver =
    normalizeText(order.driverName).startsWith('алан') || order.driverPhone?.replace(/\D/g, '') === '79285551212';

  return (
    order.restaurantSlug === 'rizih' &&
    normalizeText(order.restaurantName) === 'rizih' &&
    order.orderType === 'delivery' &&
    order.deliveryProvider === 'restaurant' &&
    order.totalAmount === 1470 &&
    normalizeText(order.addressLine) === 'ул. ленина, 123, кв. 45' &&
    isDemoDriver &&
    hasDemoItems
  );
};

const isPersistedClientStore = (value: unknown): value is Partial<ClientPlatformStore> =>
  typeof value === 'object' && value !== null;

export const useClientPlatformStore = create<ClientPlatformStore>()(
  persist(
    (set) => ({
      selectedCityId: '',
      recentCityIds: [],
      profile: { name: '', phone: '' },
      orderConsent: null,
      addresses: [],
      favoriteRestaurantIds: [],
      favoriteDishIds: [],
      carts: {},
      checkoutDrafts: {},
      orders: [],
      setSelectedCity: (cityId) =>
        set((state) => ({
          selectedCityId: cityId,
          recentCityIds: [cityId, ...state.recentCityIds.filter((item) => item !== cityId)].slice(0, 3)
        })),
      saveProfile: (profile) => set({ profile }),
      recordOrderConsent: () => set({
        orderConsent: {
          version: CLIENT_ORDER_CONSENT_VERSION,
          acceptedAt: new Date().toISOString()
        }
      }),
      addAddress: (address) =>
        set((state) => ({
          addresses: [
            address,
            ...state.addresses
              .filter((item) => item.id !== address.id)
              .map((item) => ({ ...item, isDefault: false }))
          ]
        })),
      selectDraftAddress: (restaurantSlug, address) =>
        set((state) => {
          const draft = getDraft(state.checkoutDrafts, restaurantSlug);

          return {
            checkoutDrafts: {
              ...state.checkoutDrafts,
              [restaurantSlug]: {
                ...draft,
                addressId: address.id,
                deliveryAddress: address.addressLine,
                deliveryLat: address.lat,
                deliveryLng: address.lng,
                deliveryAccuracyM: address.accuracyM,
                deliveryEntrance: address.entrance,
                deliveryFloor: address.floor,
                deliveryApartment: address.apartment,
                deliveryIntercomCode: address.intercomCode,
                deliveryLandmark: address.landmark,
                deliveryComment: address.comment
              }
            }
          };
        }),
      updateCheckoutDraft: (restaurantSlug, patch) =>
        set((state) => ({
          checkoutDrafts: {
            ...state.checkoutDrafts,
            [restaurantSlug]: { ...getDraft(state.checkoutDrafts, restaurantSlug), ...patch }
          }
        })),
      setDraftOrderType: (restaurantSlug, orderType) =>
        set((state) => ({
          checkoutDrafts: {
            ...state.checkoutDrafts,
            [restaurantSlug]: { ...getDraft(state.checkoutDrafts, restaurantSlug), orderType }
          }
        })),
      setDraftPaymentMethod: (restaurantSlug, paymentMethod) =>
        set((state) => ({
          checkoutDrafts: {
            ...state.checkoutDrafts,
            [restaurantSlug]: { ...getDraft(state.checkoutDrafts, restaurantSlug), paymentMethod }
          }
        })),
      addDish: (restaurantSlug, dishId) =>
        set((state) => {
          const currentCart = state.carts[restaurantSlug] ?? [];
          const existing = currentCart.find((line) => line.dishId === dishId);
          const nextCart = existing
            ? currentCart.map((line) =>
                line.dishId === dishId ? { ...line, quantity: line.quantity + 1 } : line
              )
            : [...currentCart, { dishId, quantity: 1 }];

          return { carts: { ...state.carts, [restaurantSlug]: nextCart } };
        }),
      decrementDish: (restaurantSlug, dishId) =>
        set((state) => ({
          carts: {
            ...state.carts,
            [restaurantSlug]: (state.carts[restaurantSlug] ?? [])
              .map((line) => (line.dishId === dishId ? { ...line, quantity: line.quantity - 1 } : line))
              .filter((line) => line.quantity > 0)
          }
        })),
      removeDish: (restaurantSlug, dishId) =>
        set((state) => ({
          carts: {
            ...state.carts,
            [restaurantSlug]: (state.carts[restaurantSlug] ?? []).filter((line) => line.dishId !== dishId)
          }
        })),
      clearCart: (restaurantSlug) =>
        set((state) => ({ carts: { ...state.carts, [restaurantSlug]: [] } })),
      submitOrder: (order) =>
        set((state) => ({
          orders: [order, ...state.orders.filter((item) => item.id !== order.id)],
          carts: { ...state.carts, [order.restaurantSlug]: [] }
        })),
      syncOrderPatch: (orderId, patch) =>
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  ...patch
                }
              : order
          )
        })),
      repeatOrder: (order) =>
        set((state) => {
          const currentDraft = getDraft(state.checkoutDrafts, order.restaurantSlug);
          const repeatedDraft: ClientCheckoutDraft = {
            ...currentDraft,
            orderType: order.orderType,
            clientName: order.clientName,
            clientPhone: order.clientPhone,
            paymentMethod: order.paymentMethod,
            ...(order.orderType === 'delivery'
              ? {
                  deliveryAddress: order.addressLine,
                  deliveryLat: Number.isFinite(order.deliveryLat) ? Number(order.deliveryLat) : currentDraft.deliveryLat,
                  deliveryLng: Number.isFinite(order.deliveryLng) ? Number(order.deliveryLng) : currentDraft.deliveryLng
                }
              : {}),
            ...(order.orderType === 'dine_in' ? { boothName: order.addressLine } : {})
          };

          return {
            carts: { ...state.carts, [order.restaurantSlug]: orderItemsToCart(order.items) },
            checkoutDrafts: { ...state.checkoutDrafts, [order.restaurantSlug]: repeatedDraft }
          };
        }),
      toggleFavoriteRestaurant: (restaurantId) =>
        set((state) => ({ favoriteRestaurantIds: toggleId(state.favoriteRestaurantIds, restaurantId) })),
      toggleFavoriteDish: (dishId) =>
        set((state) => ({ favoriteDishIds: toggleId(state.favoriteDishIds, dishId) }))
    }),
    {
      name: 'waycatalog-client-platform',
      storage: createJSONStorage(() => localStorage),
      version: 5,
      migrate: (persistedState, version) => {
        if (!isPersistedClientStore(persistedState)) {
          return persistedState as ClientPlatformStore;
        }

        let nextState = { ...persistedState };
        const persistedProfile = nextState.profile;
        if (
          version < 2 &&
          persistedProfile?.name === demoProfile.name &&
          persistedProfile.phone === demoProfile.phone
        ) {
          nextState = { ...nextState, profile: { name: '', phone: '' } };
        }

        if (version < 3) {
          const carts = { ...(nextState.carts ?? {}) };
          const rizihCart = carts.rizih;
          const isDemoCart =
            rizihCart?.length === demoCartDishIds.size &&
            rizihCart.every((line) => line.quantity === 1 && demoCartDishIds.has(line.dishId));
          if (isDemoCart) delete carts.rizih;

          nextState = {
            ...nextState,
            selectedCityId: nextState.selectedCityId === 'grozny' ? '' : nextState.selectedCityId,
            recentCityIds: (nextState.recentCityIds ?? []).filter((cityId) => cityId !== 'grozny'),
            addresses: (nextState.addresses ?? []).filter((address) => !demoAddressIds.has(address.id)),
            favoriteRestaurantIds: (nextState.favoriteRestaurantIds ?? []).filter(
              (restaurantId) => restaurantId !== demoFavoriteRestaurantId
            ),
            favoriteDishIds: (nextState.favoriteDishIds ?? []).filter((dishId) => dishId !== demoFavoriteDishId),
            carts,
            orders: (nextState.orders ?? []).filter((order) => !isLegacyDemoClientOrder(order))
          };
        }

        if (version < 4) {
          nextState = {
            ...nextState,
            orders: (nextState.orders ?? []).filter((order) => !isLegacyDemoClientOrder(order))
          };
        }

        if (version < 5) {
          const latestOrder = (nextState.orders ?? [])[0];
          const currentProfile = nextState.profile ?? { name: '', phone: '' };
          const currentAddresses = nextState.addresses ?? [];
          const recoveredAddress = latestOrder?.orderType === 'delivery'
            && latestOrder.addressLine
            && typeof latestOrder.deliveryLat === 'number'
            && typeof latestOrder.deliveryLng === 'number'
            && !currentAddresses.some((address) => address.addressLine === latestOrder.addressLine)
            ? [{
                id: `recovered-${latestOrder.id}`,
                title: 'Адрес доставки',
                addressLine: latestOrder.addressLine,
                lat: latestOrder.deliveryLat,
                lng: latestOrder.deliveryLng,
                accuracyM: null,
                entrance: '',
                floor: '',
                apartment: '',
                intercomCode: '',
                landmark: '',
                comment: '',
                isDefault: true
              }, ...currentAddresses.map((address) => ({ ...address, isDefault: false }))]
            : currentAddresses;

          nextState = {
            ...nextState,
            profile: latestOrder
              ? {
                  name: currentProfile.name || latestOrder.clientName,
                  phone: currentProfile.phone || latestOrder.clientPhone
                }
              : currentProfile,
            addresses: recoveredAddress,
            orderConsent: latestOrder
              ? { version: CLIENT_ORDER_CONSENT_VERSION, acceptedAt: latestOrder.createdAt }
              : null
          };
        }

        return nextState as ClientPlatformStore;
      },
      partialize: (state) => ({
        selectedCityId: state.selectedCityId,
        recentCityIds: state.recentCityIds,
        profile: state.profile,
        orderConsent: state.orderConsent,
        addresses: state.addresses,
        favoriteRestaurantIds: state.favoriteRestaurantIds,
        favoriteDishIds: state.favoriteDishIds,
        carts: state.carts,
        checkoutDrafts: state.checkoutDrafts,
        orders: state.orders
      })
    }
  )
);

export const selectCheckoutDraft = (
  drafts: Record<string, ClientCheckoutDraft>,
  restaurantSlug: string
) => getDraft(drafts, restaurantSlug);

export const selectRestaurantCart = (carts: Record<string, ClientCartLine[]>, restaurantSlug: string) =>
  carts[restaurantSlug] ?? [];

export const selectAllCartCount = (carts: Record<string, ClientCartLine[]>) =>
  Object.values(carts).reduce(
    (total, lines) => total + lines.reduce((cartTotal, line) => cartTotal + line.quantity, 0),
    0
  );
