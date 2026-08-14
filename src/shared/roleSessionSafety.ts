export type SignOutConfirmation = (message: string) => boolean;

export const confirmRoleSignOut = (
  roleLabel: string,
  confirm: SignOutConfirmation = (message) => window.confirm(message)
) => confirm(`Выйти из аккаунта ${roleLabel}?`);

export const getRestaurantCatalogBackTarget = ({
  catalogSlug,
  isAdmin,
  routeSection
}: {
  catalogSlug: string;
  isAdmin: boolean;
  routeSection?: string;
}) => isAdmin || routeSection === 'dishes' ? `/${catalogSlug.trim()}/dashboard` : '/';

export const getDriverBackTarget = (pathname: string) => {
  const normalized = pathname.split('?')[0].replace(/\/+$/, '') || '/driver';
  if (normalized === '/driver/settings' || normalized === '/driver/support') return '/driver/profile';
  if (normalized.startsWith('/driver/orders/')) return '/driver/orders';
  if (normalized.startsWith('/driver/map') || normalized === '/driver/qr') return '/driver/active';
  return '/driver';
};
