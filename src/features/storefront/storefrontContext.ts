import { createContext, useContext } from 'react';
import type { StorefrontContext } from '../../entities/storefront';

export type StorefrontBoundaryState = {
  isCustomDomain: boolean;
  storefront: StorefrontContext | null;
};

export const StorefrontContextValue = createContext<StorefrontBoundaryState>({
  isCustomDomain: false,
  storefront: null
});

export const useStorefrontContext = () => useContext(StorefrontContextValue);
