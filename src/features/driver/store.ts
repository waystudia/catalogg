import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DeliveryStatus } from '../order/orderLifecycle';
import { buildLocalAcceptedOffer, demoDriverId, type DeliveryOffer } from '../../shared/api/deliveryApi';

type DriverStore = {
  selectedDriverId: string;
  localActiveDelivery: DeliveryOffer | null;
  completedDeliveryIds: string[];
  dismissedDeliveryIds: string[];
  bindDriver: (driverId: string) => void;
  acceptLocalOffer: (offer: DeliveryOffer, driverId?: string) => void;
  dismissDeliveryOffer: (deliveryId: string) => void;
  updateLocalDeliveryStatus: (deliveryId: string, status: DeliveryStatus) => void;
  completeLocalDelivery: (deliveryId: string) => void;
  clearLocalActiveDelivery: () => void;
};

export const useDriverStore = create<DriverStore>()(
  persist(
    (set, get) => ({
      selectedDriverId: demoDriverId,
      localActiveDelivery: null,
      completedDeliveryIds: [],
      dismissedDeliveryIds: [],
      bindDriver: (driverId) =>
        set((state) =>
          state.selectedDriverId === driverId
            ? state
            : { selectedDriverId: driverId, localActiveDelivery: null, completedDeliveryIds: [], dismissedDeliveryIds: [] }
        ),
      acceptLocalOffer: (offer, driverId) =>
        set((state) => ({
          localActiveDelivery: buildLocalAcceptedOffer(offer, driverId ?? state.selectedDriverId)
        })),
      dismissDeliveryOffer: (deliveryId) =>
        set((state) => ({
          dismissedDeliveryIds: [deliveryId, ...state.dismissedDeliveryIds.filter((id) => id !== deliveryId)]
        })),
      updateLocalDeliveryStatus: (deliveryId, status) =>
        set((state) => ({
          localActiveDelivery: state.localActiveDelivery?.deliveryId === deliveryId
            ? {
                ...state.localActiveDelivery,
                status
              }
            : state.localActiveDelivery
        })),
      completeLocalDelivery: (deliveryId) => {
        const activeDelivery = get().localActiveDelivery;
        if (activeDelivery?.deliveryId !== deliveryId) {
          set((state) => ({
            completedDeliveryIds: [deliveryId, ...state.completedDeliveryIds.filter((id) => id !== deliveryId)]
          }));
          return;
        }

        set((state) => ({
          localActiveDelivery: null,
          completedDeliveryIds: [deliveryId, ...state.completedDeliveryIds.filter((id) => id !== deliveryId)]
        }));
      },
      clearLocalActiveDelivery: () => set({ localActiveDelivery: null })
    }),
    {
      name: 'waycatalog-driver',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<DriverStore>),
        localActiveDelivery: null
      }),
      partialize: (state) => ({
        selectedDriverId: state.selectedDriverId,
        completedDeliveryIds: state.completedDeliveryIds,
        dismissedDeliveryIds: state.dismissedDeliveryIds
      })
    }
  )
);
