export type ClientOrderType = 'dine_in' | 'pickup' | 'delivery';

export type ClientDeliveryProvider = 'restaurant' | 'platform' | 'pickup' | 'dine_in';

export type ClientPaymentMethod = 'qr' | 'bank_transfer' | 'cash';

export type ClientOrderStatus =
  | 'new'
  | 'waiting_payment_confirmation'
  | 'payment_confirmed'
  | 'accepted'
  | 'cooking'
  | 'ready'
  | 'waiting_driver'
  | 'assigned_driver'
  | 'picked_up'
  | 'on_the_way'
  | 'completed'
  | 'canceled';

export type ClientPaymentStatus = 'unpaid' | 'waiting_confirmation' | 'confirmed' | 'rejected';

export type ClientCity = {
  id: string;
  slug: string;
  name: string;
  region: string;
  isActive: boolean;
};

export type RestaurantTheme = {
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  buttonTextColor: string;
  cardColor: string;
  textColor: string;
  mutedTextColor: string;
};

export type ClientRestaurant = {
  id: string;
  slug: string;
  name: string;
  description: string;
  addressLine: string;
  lat: number | null;
  lng: number | null;
  cityId: string;
  serviceCityIds?: string[];
  categorySlugs: string[];
  logoUrl: string;
  coverUrl: string;
  rating: number;
  minOrderAmount: number;
  freeDeliveryFrom: number;
  deliveryTimeFrom: number;
  deliveryTimeTo: number;
  deliveryProvider: ClientDeliveryProvider;
  theme: RestaurantTheme;
  orderTypes: ClientOrderType[];
  paymentMethods: ClientPaymentMethod[];
  publicPath?: string;
};

export type ClientPlatformCategory = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string;
  isActive: boolean;
};

export type ClientRestaurantCategory = {
  id: string;
  restaurantSlug: string;
  slug: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
};

export type ClientDish = {
  id: string;
  restaurantSlug: string;
  categorySlug: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  tags: string[];
  isPopular: boolean;
  stockCount: number;
  weight?: string;
};

export type ClientCartLine = {
  dishId: string;
  quantity: number;
};

export type ClientCartSummary = {
  quantity: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

export type ClientAddress = {
  id: string;
  title: string;
  addressLine: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  entrance: string;
  floor: string;
  apartment: string;
  intercomCode: string;
  landmark: string;
  comment: string;
  isDefault: boolean;
};

export type ClientProfile = {
  name: string;
  phone: string;
};

export type ClientCheckoutDraft = {
  orderType: ClientOrderType;
  clientName: string;
  clientPhone: string;
  boothName: string;
  addressId: string;
  deliverySettlement: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryAccuracyM: number | null;
  deliveryEntrance: string;
  deliveryFloor: string;
  deliveryApartment: string;
  deliveryIntercomCode: string;
  deliveryLandmark: string;
  deliveryComment: string;
  paymentMethod: ClientPaymentMethod;
};

export type ClientOrderItem = {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
};

export type ClientOrder = {
  id: string;
  restaurantSlug: string;
  restaurantName: string;
  orderType: ClientOrderType;
  deliveryProvider: ClientDeliveryProvider;
  paymentMethod: ClientPaymentMethod;
  status: ClientOrderStatus;
  paymentStatus: ClientPaymentStatus;
  totalAmount: number;
  addressLine: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  estimatedTimeMin: number;
  estimatedTimeMax: number;
  driverName?: string;
  driverPhone?: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverLocationAt?: string | null;
  items: ClientOrderItem[];
};

export type PaymentSettings = {
  restaurantSlug: string;
  enableQr: boolean;
  enableBankTransfer: boolean;
  enableCash: boolean;
  bankName: string;
  recipientFullName: string;
  recipientPhone: string;
  paymentComment: string;
  qrImageUrl: string;
  requireManualConfirmation: boolean;
};

export type PlatformBanner = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'contest' | 'promo' | 'news';
  imageUrl: string;
  backgroundColor: string;
  linkUrl: string;
  isActive: boolean;
};

export type ClientPlatformSnapshot = {
  cities: ClientCity[];
  categories: ClientPlatformCategory[];
  restaurants: ClientRestaurant[];
  restaurantCategories: ClientRestaurantCategory[];
  dishes: ClientDish[];
  paymentSettings: PaymentSettings[];
  banners: PlatformBanner[];
  supportWhatsapp: string;
};
