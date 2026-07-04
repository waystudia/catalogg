import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartItem, OrderMode, Product, ThemeSettings } from '../entities/models';
import { themeSettings } from '../data/catalog';

type CartStore = {
  items: CartItem[];
  updatedAt: number | null;
  add: (product: Product) => void;
  remove: (productId: string) => void;
  decrement: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
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

export const CART_TTL_MS = 5 * 60 * 1000;

const touchCart = () => Date.now();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const persistedCartIsFresh = (updatedAt: unknown) =>
  typeof updatedAt === 'number' && Number.isFinite(updatedAt) && Date.now() - updatedAt < CART_TTL_MS;

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      updatedAt: null,
      add: (product) =>
        set((state) => {
          if (product.stock_count <= 0) {
            return state;
          }

          const existing = state.items.find((item) => item.product.id === product.id);

          if (existing) {
            return {
              updatedAt: touchCart(),
              items: state.items.map((item) =>
                item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
              )
            };
          }

          return { items: [...state.items, { product, quantity: 1 }], updatedAt: touchCart() };
        }),
      remove: (productId) =>
        set((state) => {
          const items = state.items.filter((item) => item.product.id !== productId);
          return { items, updatedAt: items.length > 0 ? touchCart() : null };
        }),
      decrement: (productId) =>
        set((state) => {
          const items = state.items
            .map((item) =>
              item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
            )
            .filter((item) => item.quantity > 0);
          return { items, updatedAt: items.length > 0 ? touchCart() : null };
        }),
      updateQuantity: (productId, quantity) =>
        set((state) => {
          const items =
            quantity <= 0
              ? state.items.filter((item) => item.product.id !== productId)
              : state.items.map((item) =>
                  item.product.id === productId ? { ...item, quantity } : item
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
        const items = Array.isArray(persisted.items) && persistedCartIsFresh(persisted.updatedAt)
          ? (persisted.items as CartItem[])
          : [];
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
  items.reduce((total, item) => total + item.product.price * item.quantity, 0);

export const hasDrinkInCart = (items: CartItem[]) =>
  items.some((item) => item.product.drink_type !== undefined);

export const isSauceProduct = (product: Product) => {
  const text = [product.id, product.title, product.description, product.category_id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('соус') || text.includes('sauce');
};

export const hasSauceInCart = (items: CartItem[]) =>
  items.some((item) => isSauceProduct(item.product));
