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
