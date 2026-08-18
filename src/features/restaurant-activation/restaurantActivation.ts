export const RESTAURANT_LEGAL_STATUSES = [
  'draft',
  'configured',
  'awaiting_acceptance',
  'active',
  'suspended',
  'terminated',
  'archived',
  'legacy_review_required',
  'reacceptance_required'
] as const;

export type RestaurantLegalStatus = (typeof RESTAURANT_LEGAL_STATUSES)[number];

export const REQUIRED_ACTIVATION_CONFIRMATIONS = [
  {
    key: 'contract',
    label: 'Я ознакомился и принимаю универсальный договор-оферту для бизнес-партнёров WayYaam.'
  },
  {
    key: 'tariff',
    label: 'Я ознакомился и принимаю действующие тарифы и порядок расчёта комиссии.'
  },
  {
    key: 'operations_rules',
    label: 'Я ознакомился с регламентом работы и правилами обработки заказов.'
  },
  {
    key: 'restaurant_data',
    label: 'Я подтверждаю достоверность предоставленных сведений о бизнесе.'
  },
  {
    key: 'authority',
    label: 'Я подтверждаю, что являюсь владельцем, руководителем или имею достаточные полномочия действовать от имени бизнес-партнёра.'
  },
  {
    key: 'content_license',
    label: 'Я подтверждаю право WayYaam использовать переданные название, логотип, фотографии, описания и другие материалы в пределах договора.'
  },
  {
    key: 'privacy_policy',
    label: 'Я ознакомился с политикой обработки персональных данных.'
  }
] as const;

export type ActivationConfirmationKey = (typeof REQUIRED_ACTIVATION_CONFIRMATIONS)[number]['key'];
export type ActivationConfirmations = Record<ActivationConfirmationKey, boolean>;

export const createEmptyActivationConfirmations = (): ActivationConfirmations =>
  Object.fromEntries(REQUIRED_ACTIVATION_CONFIRMATIONS.map(({ key }) => [key, false])) as ActivationConfirmations;

export const getMissingActivationConfirmations = (
  confirmations: ActivationConfirmations
): ActivationConfirmationKey[] =>
  REQUIRED_ACTIVATION_CONFIRMATIONS
    .filter(({ key }) => confirmations[key] !== true)
    .map(({ key }) => key);

export type RestaurantMemberRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'platform_admin' | null;

export const canAcceptRestaurantLegalDocuments = ({
  role,
  canAcceptLegalDocuments
}: {
  role: RestaurantMemberRole;
  canAcceptLegalDocuments: boolean;
}) => role !== null && role !== 'platform_admin' && (role === 'owner' || canAcceptLegalDocuments);

export const canRestaurantAcceptRealOrders = (status: RestaurantLegalStatus) => [
  'draft',
  'configured',
  'awaiting_acceptance',
  'active',
  'legacy_review_required',
  'reacceptance_required'
].includes(status);

export const getRestaurantActivationProgress = ({
  documentsOpened,
  documentCount,
  confirmationsComplete,
  codeRequested,
  active
}: {
  documentsOpened: number;
  documentCount: number;
  confirmationsComplete: boolean;
  codeRequested: boolean;
  active: boolean;
}) => {
  if (active) return 5;
  if (codeRequested) return 4;
  if (confirmationsComplete && documentCount > 0 && documentsOpened >= documentCount) return 3;
  if (documentsOpened > 0) return 2;
  return 1;
};
