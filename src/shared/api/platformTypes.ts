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
  email?: string;
  cityName?: string;
  source: string;
  createdAt: string;
};

export type PlatformUserOrder = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  amount: number;
  status: string;
  cityName: string;
  createdAt: string;
};

export type PlatformUserDirectoryItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  cityName: string;
  source: string;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
  averageCheck: number;
  lastOrderAt: string | null;
  favoriteRestaurant: string;
  orders: PlatformUserOrder[];
};

export type PlatformUserDirectory = {
  users: PlatformUserDirectoryItem[];
  totalOrders: number;
  totalRevenue: number;
  settlements: string[];
  restaurants: Array<{ id: string; name: string }>;
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
  name: string;
  title: string;
  subtitle: string;
  kind: 'banner' | 'contest' | 'promo' | 'news';
  imageUrl: string;
  backgroundColor: string;
  linkUrl: string;
  pageId: string | null;
  actionLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type PlatformGlobalSettings = {
  supportWhatsapp: string;
  supportPhone: string;
  supportEmail: string;
  supportTelegram: string;
  supportHours: string;
  supportHint: string;
};

export type PlatformContentBlockType =
  | 'heading'
  | 'subheading'
  | 'text'
  | 'image'
  | 'gallery'
  | 'video'
  | 'divider'
  | 'button'
  | 'link';

export type PlatformContentBlock = {
  id: string;
  type: PlatformContentBlockType;
  content: string;
  url: string;
  label: string;
};

export type PlatformContentPage = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'inactive';
  blocks: PlatformContentBlock[];
  bannerUsageCount: number;
  createdAt: string;
  updatedAt: string;
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
  daysActive: number;
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
  maxActiveDeliveries: number;
  createdAt: string;
};

export type PlatformDriverActivity = {
  driverId: string;
  deliveryCount: number;
  completedDeliveries: number;
  earnedAmount: number;
};

export type PlatformContestTicket = {
  id: string;
  contestId: string;
  orderId: string;
  restaurantName: string;
  customerName: string;
  customerPhone: string;
  deliveryCity: string;
  totalAmount: number;
  orderedItems: string[];
  createdAt: string;
};

export type PlatformAnalytics = {
  totalOrders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatOrderRate: number;
  orderTypes: Array<{ key: 'hall' | 'takeaway' | 'delivery'; label: string; count: number }>;
  locations: Array<{ name: string; count: number }>;
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
  maxActiveDeliveries?: number;
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
  paidAt: string | null;
  createdAt: string;
};
