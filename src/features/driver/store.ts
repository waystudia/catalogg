import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DeliveryStatus } from '../order/orderLifecycle';
import { buildLocalAcceptedOffer, demoDriverId, type DeliveryOffer } from '../../shared/api/deliveryApi';

type DriverStore = {
  selectedDriverId: string;
  isOnline: boolean;
  localActiveDelivery: DeliveryOffer | null;
  completedDeliveryIds: string[];
  setOnline: (isOnline: boolean) => void;
  acceptLocalOffer: (offer: DeliveryOffer, driverId?: string) => void;
  updateLocalDeliveryStatus: (status: DeliveryStatus) => void;
  completeLocalDelivery: () => void;
  clearLocalActiveDelivery: () => void;
};

export const useDriverStore = create<DriverStore>()(
  persist(
    (set, get) => ({
      selectedDriverId: demoDriverId,
      isOnline: true,
      localActiveDelivery: null,
      completedDeliveryIds: [],
      setOnline: (isOnline) => set({ isOnline }),
      acceptLocalOffer: (offer, driverId) =>
        set((state) => ({
          localActiveDelivery: buildLocalAcceptedOffer(offer, driverId ?? state.selectedDriverId),
          isOnline: true
        })),
      updateLocalDeliveryStatus: (status) =>
        set((state) => ({
          localActiveDelivery: state.localActiveDelivery
            ? {
                ...state.localActiveDelivery,
                status
              }
            : null
        })),
      completeLocalDelivery: () => {
        const activeDelivery = get().localActiveDelivery;
        if (!activeDelivery) return;

        set((state) => ({
          localActiveDelivery: null,
          completedDeliveryIds: [activeDelivery.deliveryId, ...state.completedDeliveryIds]
        }));
      },
      clearLocalActiveDelivery: () => set({ localActiveDelivery: null })
    }),
    {
      name: 'waycatalog-driver',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedDriverId: state.selectedDriverId,
        isOnline: state.isOnline,
        localActiveDelivery: state.localActiveDelivery,
        completedDeliveryIds: state.completedDeliveryIds
      })
    }
  )
);
