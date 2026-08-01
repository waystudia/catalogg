import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartItem, OrderMode, Product, SelectedProductModifier, ThemeSettings } from '../entities/models';
import { getCartItemTotal } from '../entities/productVariants';
import { buildCartLineId, getCartLineId } from '../entities/productModifiers';
import { themeSettings } from '../data/catalog';
import { redirectToClientHome } from '../shared/appNavigation';

type CartStore = {
  items: CartItem[];
  updatedAt: number | null;
  add: (product: Product, selectedChoice?: string, selectedModifiers?: SelectedProductModifier[]) => void;
  remove: (lineIdOrProductId: string) => void;
  decrement: (lineIdOrProductId: string) => void;
  updateQuantity: (lineIdOrProductId: string, quantity: number) => void;
  clear: () => void;
};

type AuthStore = {
  isAdmin: boolean;
  setAdmin: (isAdmin: boolean) => void;
  login: (email: string, password: string, catalogSlug?: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

type ThemeStore = {
  theme: ThemeSettings;
  updateTheme: (patch: Partial<ThemeSettings>) => void;
};

type AdminStore = {
  isPanelOpen: boolean;
  editor: 'dish' | 'categories' | 'design' | 'settings' | null;
  setEditor: (editor: AdminStore['editor']) => void;
};

type OrderStore = {
  mode: OrderMode;
  cabinId: string;
  deliveryCity: string;
  deliverySettlement: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryAccuracyM: number | null;
  clientName: string;
  clientPhone: string;
  date: string;
  time: string;
  guests: number;
  setOrder: (patch: Partial<Omit<OrderStore, 'setOrder'>>) => void;
};

const touchCart = () => Date.now();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      updatedAt: null,
      add: (product, selectedChoice, selectedModifiers = []) =>
        set((state) => {
          if (!product.is_unlimited && product.stock_count <= 0) {
            return state;
          }

          const lineId = buildCartLineId(product.id, selectedChoice, selectedModifiers);
          const existing = state.items.find((item) => getCartLineId(item) === lineId);

          if (existing) {
            return {
              updatedAt: touchCart(),
              items: state.items.map((item) =>
                getCartLineId(item) === lineId
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              )
            };
          }

          return {
            items: [...state.items, {
              product,
              quantity: 1,
              selected_choice: selectedChoice,
              selected_modifiers: selectedModifiers,
              line_id: lineId
            }],
            updatedAt: touchCart()
          };
        }),
      remove: (lineIdOrProductId) =>
        set((state) => {
          const items = state.items.filter((item) => getCartLineId(item) !== lineIdOrProductId && item.product.id !== lineIdOrProductId);
          return { items, updatedAt: items.length > 0 ? touchCart() : null };
        }),
      decrement: (lineIdOrProductId) =>
        set((state) => {
          const items = state.items
            .map((item) =>
              getCartLineId(item) === lineIdOrProductId || item.product.id === lineIdOrProductId
                ? { ...item, quantity: item.quantity - 1 }
                : item
            )
            .filter((item) => item.quantity > 0);
          return { items, updatedAt: items.length > 0 ? touchCart() : null };
        }),
      updateQuantity: (lineIdOrProductId, quantity) =>
        set((state) => {
          const items =
            quantity <= 0
              ? state.items.filter((item) => getCartLineId(item) !== lineIdOrProductId && item.product.id !== lineIdOrProductId)
              : state.items.map((item) =>
                  getCartLineId(item) === lineIdOrProductId || item.product.id === lineIdOrProductId ? { ...item, quantity } : item
                );
          return { items, updatedAt: items.length > 0 ? touchCart() : null };
        }),
      clear: () => set({ items: [], updatedAt: null })
    }),
    {
      name: 'mangal-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, updatedAt: state.updatedAt }),
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;
        const items = Array.isArray(persisted.items) ? (persisted.items as CartItem[]) : [];
        return {
          ...current,
          items,
          updatedAt: items.length > 0 && typeof persisted.updatedAt === 'number' ? persisted.updatedAt : null
        };
      }
    }
  )
);

export const useAuthStore = create<AuthStore>((set) => ({
  isAdmin: false,
  setAdmin: (isAdmin) => set({ isAdmin }),
  login: async (email, password, catalogSlug) => {
    const { signInAdmin } = await import('../shared/supabase');
    const success = await signInAdmin(email, password, catalogSlug);
    if (success) {
      set({ isAdmin: true });
    } else {
      set({ isAdmin: false });
    }
    return success;
  },
  logout: async () => {
    const { signOutAdmin } = await import('../shared/supabase');
    await signOutAdmin();
    set({ isAdmin: false });
    redirectToClientHome();
  }
}));

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: themeSettings,
  updateTheme: (patch) => set((state) => ({ theme: { ...state.theme, ...patch } }))
}));

export const useAdminStore = create<AdminStore>((set) => ({
  isPanelOpen: false,
  editor: null,
  setEditor: (editor) => set({ editor, isPanelOpen: editor !== null })
}));

export const useOrderStore = create<OrderStore>((set) => ({
  mode: 'hall',
  cabinId: 'cabin-1',
  deliveryCity: '',
  deliverySettlement: '',
  deliveryAddress: '',
  deliveryLat: null,
  deliveryLng: null,
  deliveryAccuracyM: null,
  clientName: '',
  clientPhone: '',
  date: '24 мая, сб',
  time: '19:00',
  guests: 4,
  setOrder: (patch) => set((state) => ({ ...state, ...patch }))
}));

export const selectCartCount = (items: CartItem[]) =>
  items.reduce((total, item) => total + item.quantity, 0);

export const selectCartTotal = (items: CartItem[]) =>
  items.reduce((total, item) => total + getCartItemTotal(item), 0);

export const hasDrinkInCart = (items: CartItem[]) =>
  items.some((item) => item.product.drink_type !== undefined);

export const isSauceProduct = (product: Product) => {
  const text = [product.id, product.title, product.category_id, ...(product.category_ids ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('соус') || text.includes('sauce');
};

export const hasSauceInCart = (items: CartItem[]) =>
  items.some((item) => isSauceProduct(item.product));
