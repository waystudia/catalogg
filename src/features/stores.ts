import { create } from 'zustand';
import type { CartItem, OrderMode, Product, ThemeSettings } from '../entities/models';
import { themeSettings } from '../data/catalog';

type CartStore = {
  items: CartItem[];
  add: (product: Product) => void;
  remove: (productId: string) => void;
  decrement: (productId: string) => void;
  clear: () => void;
};

type AuthStore = {
  isAdmin: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
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
  date: string;
  time: string;
  guests: number;
  setOrder: (patch: Partial<Omit<OrderStore, 'setOrder'>>) => void;
};

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  add: (product) =>
    set((state) => {
      if (product.stock_count <= 0) {
        return state;
      }

      const existing = state.items.find((item) => item.product.id === product.id);

      if (existing) {
        return {
          items: state.items.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          )
        };
      }

      return { items: [...state.items, { product, quantity: 1 }] };
    }),
  remove: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.product.id !== productId)
    })),
  decrement: (productId) =>
    set((state) => ({
      items: state.items
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    })),
  clear: () => set({ items: [] })
}));

export const useAuthStore = create<AuthStore>((set) => ({
  isAdmin: false,
  login: (email, password) => {
    const success = email.trim().length > 3 && password.trim().length >= 4;
    if (success) {
      set({ isAdmin: true });
    }
    return success;
  },
  logout: () => set({ isAdmin: false })
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
