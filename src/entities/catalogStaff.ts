export type CatalogMembershipRole = 'owner' | 'admin' | 'editor' | 'viewer' | null;
export type CatalogStaffRole = 'manager' | 'picker' | null;
export type CatalogOrderWorkAssignmentState =
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'superseded';

export type CatalogOrderWorkAssignment = {
  id: string;
  orderId: string;
  assigneeUserId: string;
  assigneeName: string;
  assigneeEmail: string;
  state: CatalogOrderWorkAssignmentState;
  offeredAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  version: number;
  isMine: boolean;
};

export const getCatalogWorkspaceAccess = ({
  catalogRole,
  staffRole
}: {
  catalogRole: CatalogMembershipRole;
  staffRole: CatalogStaffRole;
}) => {
  const canSeeFullWorkspace = catalogRole === 'owner' || catalogRole === 'admin' || catalogRole === 'editor';
  const isOrderWorker = staffRole === 'manager' || staffRole === 'picker';

  return {
    canManageTeam: catalogRole === 'owner' || catalogRole === 'admin',
    canSeeFinance: catalogRole === 'owner' || catalogRole === 'admin',
    canSeeFullWorkspace,
    isOrderWorker
  };
};

export const getVisibleAssignedOrderIds = (assignments: CatalogOrderWorkAssignment[]) =>
  new Set(
    assignments
      .filter((assignment) => assignment.isMine && ['offered', 'accepted'].includes(assignment.state))
      .map((assignment) => assignment.orderId)
  );
