import type {
  CatalogOrderWorkAssignment,
  CatalogOrderWorkAssignmentState,
  CatalogStaffRole
} from '../../entities/catalogStaff';
import { supabase } from '../supabase';

export type CatalogStaffMember = {
  userId: string;
  fullName: string;
  email: string;
  roleCode: Exclude<CatalogStaffRole, null>;
  roleName: string;
  isActive: boolean;
  receivesNewOrders: boolean;
  updatedAt: string;
};

type StaffRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_code: string;
  role_name: string | null;
  is_active: boolean | null;
  receives_new_orders: boolean | null;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  order_id: string;
  assignee_user_id: string;
  assignee_name: string | null;
  assignee_email: string | null;
  state: string;
  offered_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  version: number | string;
  is_mine: boolean | null;
};

const mapStaffMember = (row: StaffRow): CatalogStaffMember => ({
  userId: row.user_id,
  fullName: row.full_name?.trim() || 'Сотрудник',
  email: row.email?.trim() || '',
  roleCode: row.role_code as Exclude<CatalogStaffRole, null>,
  roleName: row.role_name?.trim() || row.role_code,
  isActive: row.is_active ?? false,
  receivesNewOrders: row.receives_new_orders ?? false,
  updatedAt: row.updated_at
});

const mapAssignment = (row: AssignmentRow): CatalogOrderWorkAssignment => ({
  id: row.id,
  orderId: row.order_id,
  assigneeUserId: row.assignee_user_id,
  assigneeName: row.assignee_name?.trim() || 'Сотрудник',
  assigneeEmail: row.assignee_email?.trim() || '',
  state: row.state as CatalogOrderWorkAssignmentState,
  offeredAt: row.offered_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  version: Number(row.version),
  isMine: row.is_mine ?? false
});

export async function getCatalogStaffMembers(catalogId: string): Promise<CatalogStaffMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_catalog_staff_for_catalog', {
    target_catalog_id: catalogId
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as StaffRow[]).map(mapStaffMember);
}

export async function linkCatalogStaffByEmail({
  catalogId,
  email,
  roleCode,
  receivesNewOrders = true
}: {
  catalogId: string;
  email: string;
  roleCode: Exclude<CatalogStaffRole, null>;
  receivesNewOrders?: boolean;
}): Promise<CatalogStaffMember> {
  if (!supabase) {
    return {
      userId: `demo-${roleCode}`,
      fullName: email.split('@')[0] || 'Сотрудник',
      email: email.trim().toLowerCase(),
      roleCode,
      roleName: roleCode === 'picker' ? 'Сборщик' : 'Менеджер заказов',
      isActive: true,
      receivesNewOrders,
      updatedAt: new Date().toISOString()
    };
  }
  const { data, error } = await supabase.rpc('link_catalog_staff_by_email', {
    target_catalog_id: catalogId,
    target_email: email.trim().toLowerCase(),
    target_role_code: roleCode,
    target_receives_new_orders: receivesNewOrders
  });
  if (error) throw new Error(error.message);
  const row = (data as StaffRow[] | null)?.[0];
  if (!row) throw new Error('Не удалось добавить сотрудника');
  return mapStaffMember(row);
}

export async function removeCatalogStaffMember(catalogId: string, userId: string): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('remove_catalog_staff_member', {
    target_catalog_id: catalogId,
    target_user_id: userId
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function getCatalogOrderAssignments(catalogId: string): Promise<CatalogOrderWorkAssignment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_catalog_order_assignments', {
    target_catalog_id: catalogId
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AssignmentRow[]).map(mapAssignment);
}

export async function acceptCatalogOrderAssignment(assignmentId: string, expectedVersion: number) {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('accept_catalog_order_assignment', {
    target_assignment_id: assignmentId,
    expected_version: expectedVersion
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function escalateCatalogOrderAssignments(catalogId: string) {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('escalate_catalog_order_assignments', {
    target_catalog_id: catalogId
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function updateCatalogAssignedOrderStatus({
  orderId,
  catalogId,
  status
}: {
  orderId: string;
  catalogId: string;
  status: string;
}) {
  if (!supabase) return status;
  const { data, error } = await supabase.rpc('update_catalog_assigned_order_status', {
    target_order_id: orderId,
    target_catalog_id: catalogId,
    next_status: status
  });
  if (error) throw new Error(error.message);
  return String(data ?? status);
}
