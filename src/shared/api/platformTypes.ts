export type ClientStatus = 'active' | 'inactive' | 'blocked' | 'pending';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';

export type PlatformTemplateOption = {
  templateVersionId: string;
  templateKey: string;
  templateName: string;
  businessType: string;
  version: number;
  description: string;
  templateCatalogSlug?: string;
  isCatalogTemplate?: boolean;
};

export type CreateRestaurantTemplatePayload = {
  name: string;
  slug: string;
  templateName?: string;
};

export type PlatformClient = {
  id: string;
  companyName: string;
  ownerName: string;
  email: string;
  phone: string;
  primaryCity: string;
  serviceSettlements: string[];
  status: ClientStatus;
  planCode: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  catalogId: string;
  catalogName: string;
  catalogSlug: string;
  catalogStatus: 'draft' | 'published' | 'archived';
  templateName: string;
  templateKey: string;
  templateVersion: number;
  businessType: string;
  logoUrl: string;
  createdAt: string;
};

export type ClientSignup = {
  id: string;
  name: string;
  phone: string;
  source: string;
  createdAt: string;
};

export type PlatformSettlementRequest = {
  id: string;
  cityName: string;
  settlementName: string;
  source: string;
  count: number;
  status: 'new' | 'approved' | 'dismissed';
  createdAt: string;
  lastSeenAt: string;
};

export type PlatformDeliverySettlement = {
  id: string;
  cityName: string;
  settlementName: string;
  isActive: boolean;
  createdAt: string;
};

export type PlatformBannerAdmin = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'contest' | 'promo' | 'news';
  imageUrl: string;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
};

export type PlatformGlobalSettings = {
  supportWhatsapp: string;
};

export type PlatformRestaurantStats = {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  revenue: number;
  debt: number;
  ordersCount: number;
  driverDeliveries: number;
};

export type ClientListParams = {
  search?: string;
  status?: string;
  templateId?: string;
  payment?: string;
  page: number;
  pageSize: number;
};

export type PlatformStats = {
  totalClients: number;
  activeCatalogs: number;
  monthlyRevenue: number;
  monthlyViews: number;
  totalDebt: number;
  totalOrders: number;
  driverDeliveries: number;
  restaurantStats: PlatformRestaurantStats[];
};

export type CreateClientPayload = {
  name: string;
  slug: string;
  ownerName?: string;
  email: string;
  phone?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  password: string;
  templateVersionId: string;
  businessType: string;
  planId?: string;
  subscriptionEndsAt?: string;
  status?: ClientStatus;
  subscriptionStatus?: SubscriptionStatus;
  adminConsentConfirmed?: boolean;
};

export type CreateClientResult = {
  clientId: string;
  catalogId: string;
  slug: string;
  email: string;
};

export type PlatformDriver = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  vehicleInfo: string;
  carNumber: string;
  photoUrl: string;
  cityName: string;
  serviceSettlements: string[];
  isActive: boolean;
  isOnline: boolean;
  status: string;
  rating: number;
  debt: number;
  createdAt: string;
};

export type PlatformContestTicket = {
  id: string;
  contestId: string;
  orderId: string;
  restaurantName: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  orderedItems: string[];
  createdAt: string;
};

export type PlatformBillingSettings = {
  clientFee: number;
  restaurantCommission: number;
  driverTariff: number;
  restaurantLimit: number;
  driverLimit: number;
  warningPercent: number;
};

export type PlatformCustomTariff = {
  id: string;
  subjectType: 'restaurant' | 'driver';
  subjectId: string;
  tariffPercent: number;
  isActive: boolean;
};

export type CreateDriverPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
  cityName?: string;
  serviceSettlements?: string[];
  vehicleInfo?: string;
  carNumber?: string;
  photoUrl?: string;
};

export type CreateDriverResult = {
  driverId: string;
  userId: string;
  email: string;
};

export type UpdateDriverPayload = {
  driverId: string;
  userId?: string;
  name?: string;
  phone?: string;
  cityName?: string;
  serviceSettlements?: string[];
  vehicleInfo?: string;
  carNumber?: string;
  photoUrl?: string;
  password?: string;
  isActive?: boolean;
};

export type UpdateClientPayload = {
  clientId: string;
  companyName?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  password?: string;
  status?: ClientStatus;
  planId?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionEndsAt?: string | null;
};

export type UpdateClientResult = {
  clientId: string;
  email: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  actorEmail: string;
  clientName: string;
  createdAt: string;
};

export type SubscriptionRow = {
  id: string;
  clientName: string;
  planCode: string;
  amount: number;
  status: SubscriptionStatus;
  endsAt: string | null;
};
