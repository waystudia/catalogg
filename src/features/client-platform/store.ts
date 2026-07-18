import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ClientAddress,
  ClientCartLine,
  ClientCheckoutDraft,
  ClientOrder,
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
  addresses: ClientAddress[];
  favoriteRestaurantIds: string[];
  favoriteDishIds: string[];
  carts: Record<string, ClientCartLine[]>;
  checkoutDrafts: Record<string, ClientCheckoutDraft>;
  orders: ClientOrder[];
  setSelectedCity: (cityId: string) => void;
  saveProfile: (profile: ClientProfile) => void;
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

const isPersistedClientStore = (value: unknown): value is Partial<ClientPlatformStore> =>
  typeof value === 'object' && value !== null;

export const useClientPlatformStore = create<ClientPlatformStore>()(
  persist(
    (set) => ({
      selectedCityId: '',
      recentCityIds: [],
      profile: { name: '', phone: '' },
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
        set((state) => ({
          carts: { ...state.carts, [order.restaurantSlug]: orderItemsToCart(order.items) }
        })),
      toggleFavoriteRestaurant: (restaurantId) =>
        set((state) => ({ favoriteRestaurantIds: toggleId(state.favoriteRestaurantIds, restaurantId) })),
      toggleFavoriteDish: (dishId) =>
        set((state) => ({ favoriteDishIds: toggleId(state.favoriteDishIds, dishId) }))
    }),
    {
      name: 'waycatalog-client-platform',
      storage: createJSONStorage(() => localStorage),
      version: 3,
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
            orders: (nextState.orders ?? []).filter((order) => order.id !== demoOrderId)
          };
        }

        return nextState as ClientPlatformStore;
      },
      partialize: (state) => ({
        selectedCityId: state.selectedCityId,
        recentCityIds: state.recentCityIds,
        profile: state.profile,
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
