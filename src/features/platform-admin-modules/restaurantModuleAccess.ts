import type { SubscriptionStatus } from '../../shared/api/platformTypes';

export type RestaurantModulePackage = 'basic' | 'pos' | 'pos_warehouse' | 'full';
export type RestaurantModuleAccessMode = 'disabled' | 'active' | 'read_only';

export type RestaurantModuleFeatures = {
  posEnabled: boolean;
  warehouseEnabled: boolean;
  recipesEnabled: boolean;
  financeEnabled: boolean;
  promotionsEnabled: boolean;
  loyaltyEnabled: boolean;
};

export type RestaurantModules = RestaurantModuleFeatures & {
  catalogId: string;
  packageCode: RestaurantModulePackage;
  maxCashiers: number;
  maxDevices: number;
  maxLocations: number;
  maxWarehouses: number;
};

const packageFeatures: Record<RestaurantModulePackage, RestaurantModuleFeatures> = {
  basic: {
    posEnabled: false,
    warehouseEnabled: false,
    recipesEnabled: false,
    financeEnabled: false,
    promotionsEnabled: false,
    loyaltyEnabled: false
  },
  pos: {
    posEnabled: true,
    warehouseEnabled: false,
    recipesEnabled: false,
    financeEnabled: false,
    promotionsEnabled: false,
    loyaltyEnabled: false
  },
  pos_warehouse: {
    posEnabled: true,
    warehouseEnabled: true,
    recipesEnabled: true,
    financeEnabled: false,
    promotionsEnabled: false,
    loyaltyEnabled: false
  },
  full: {
    posEnabled: true,
    warehouseEnabled: true,
    recipesEnabled: true,
    financeEnabled: true,
    promotionsEnabled: true,
    loyaltyEnabled: true
  }
};

export const getRestaurantModulePackageFeatures = (
  packageCode: RestaurantModulePackage
): RestaurantModuleFeatures => ({ ...packageFeatures[packageCode] });

export const createDefaultRestaurantModules = (catalogId: string): RestaurantModules => ({
  catalogId,
  packageCode: 'basic',
  ...getRestaurantModulePackageFeatures('basic'),
  maxCashiers: 1,
  maxDevices: 1,
  maxLocations: 1,
  maxWarehouses: 0
});

export const getModuleAccessMode = ({
  enabled,
  status,
  endsAt,
  now = new Date()
}: {
  enabled: boolean;
  status: SubscriptionStatus;
  endsAt: string | null;
  now?: Date;
}): RestaurantModuleAccessMode => {
  if (!enabled) return 'disabled';
  const currentStatus = status === 'active' || status === 'trial';
  const currentPeriod = !endsAt || new Date(endsAt).getTime() > now.getTime();
  return currentStatus && currentPeriod ? 'active' : 'read_only';
};
