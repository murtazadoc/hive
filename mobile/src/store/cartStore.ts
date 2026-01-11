import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =====================================================
// TYPES
// =====================================================
export interface CartItem {
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl?: string;
    businessId: string;
  };
  quantity: number;
  variantId?: string;
  variantName?: string;
}

interface CartState {
  items: CartItem[];
  businessId: string | null;
  businessName: string | null;

  // Actions
  addItem: (item: CartItem, businessId: string, businessName: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;

  // Computed
  getItemCount: () => number;
  getTotal: () => number;
  getItem: (productId: string, variantId?: string) => CartItem | undefined;
}

// =====================================================
// CART STORE
// =====================================================
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      businessId: null,
      businessName: null,

      addItem: (item, businessId, businessName) => {
        const { items, businessId: currentBusinessId } = get();

        // If cart has items from different business, ask to clear
        if (currentBusinessId && currentBusinessId !== businessId) {
          // In UI, you'd show a confirmation dialog
          // For now, we'll clear and add
          set({
            items: [item],
            businessId,
            businessName,
          });
          return;
        }

        // Check if item already exists
        const existingIndex = items.findIndex(
          (i) =>
            i.product.id === item.product.id &&
            i.variantId === item.variantId,
        );

        if (existingIndex > -1) {
          // Update quantity
          const newItems = [...items];
          newItems[existingIndex].quantity += item.quantity;
          set({ items: newItems });
        } else {
          // Add new item
          set({
            items: [...items, item],
            businessId,
            businessName,
          });
        }
      },

      removeItem: (productId, variantId) => {
        const { items } = get();
        const newItems = items.filter(
          (i) =>
            !(i.product.id === productId && i.variantId === variantId),
        );

        if (newItems.length === 0) {
          set({ items: [], businessId: null, businessName: null });
        } else {
          set({ items: newItems });
        }
      },

      updateQuantity: (productId, quantity, variantId) => {
        const { items } = get();

        if (quantity <= 0) {
          get().removeItem(productId, variantId);
          return;
        }

        const newItems = items.map((item) => {
          if (item.product.id === productId && item.variantId === variantId) {
            return { ...item, quantity };
          }
          return item;
        });

        set({ items: newItems });
      },

      clearCart: () => {
        set({ items: [], businessId: null, businessName: null });
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getTotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        );
      },

      getItem: (productId, variantId) => {
        return get().items.find(
          (i) =>
            i.product.id === productId && i.variantId === variantId,
        );
      },
    }),
    {
      name: 'hive-cart',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// =====================================================
// HELPERS
// =====================================================
export function formatCartForCheckout(cart: CartState) {
  return {
    businessId: cart.businessId,
    items: cart.items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      variantId: item.variantId,
    })),
  };
}
