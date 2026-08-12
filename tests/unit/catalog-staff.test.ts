import { describe, expect, it } from 'vitest';
import {
  getCatalogWorkspaceAccess,
  getVisibleAssignedOrderIds,
  type CatalogOrderWorkAssignment
} from '../../src/entities/catalogStaff';

describe('catalog staff workspace access', () => {
  it('keeps the existing owner workspace and enables team management', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'owner', staffRole: null })).toEqual({
      canManageTeam: true,
      canSeeFinance: true,
      canSeeFullWorkspace: true,
      isOrderWorker: false
    });
  });

  it('limits a picker to assigned order work without finance or settings', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'viewer', staffRole: 'picker' })).toEqual({
      canManageTeam: false,
      canSeeFinance: false,
      canSeeFullWorkspace: false,
      isOrderWorker: true
    });
  });

  it('gives an administrator team, finance, and full workspace access', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'admin', staffRole: null })).toEqual({
      canManageTeam: true,
      canSeeFinance: true,
      canSeeFullWorkspace: true,
      isOrderWorker: false
    });
  });

  it('keeps an editor in the full workspace without team or finance authority', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'editor', staffRole: null })).toEqual({
      canManageTeam: false,
      canSeeFinance: false,
      canSeeFullWorkspace: true,
      isOrderWorker: false
    });
  });

  it('recognizes a manager as an order worker without owner privileges', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'viewer', staffRole: 'manager' })).toEqual({
      canManageTeam: false,
      canSeeFinance: false,
      canSeeFullWorkspace: false,
      isOrderWorker: true
    });
  });

  it('does not accidentally promote an ordinary catalog viewer', () => {
    expect(getCatalogWorkspaceAccess({ catalogRole: 'viewer', staffRole: null })).toEqual({
      canManageTeam: false,
      canSeeFinance: false,
      canSeeFullWorkspace: false,
      isOrderWorker: false
    });
  });
});

describe('catalog staff order visibility', () => {
  const assignments: CatalogOrderWorkAssignment[] = [
    {
      id: 'assignment-offered',
      orderId: 'order-a',
      assigneeUserId: 'picker-a',
      assigneeName: 'Сборщик А',
      assigneeEmail: 'picker-a@example.test',
      state: 'offered',
      offeredAt: '2026-08-12T12:00:00.000Z',
      expiresAt: '2026-08-12T12:02:00.000Z',
      acceptedAt: null,
      version: 1,
      isMine: true
    },
    {
      id: 'assignment-expired',
      orderId: 'order-b',
      assigneeUserId: 'picker-a',
      assigneeName: 'Сборщик А',
      assigneeEmail: 'picker-a@example.test',
      state: 'expired',
      offeredAt: '2026-08-12T11:00:00.000Z',
      expiresAt: '2026-08-12T11:02:00.000Z',
      acceptedAt: null,
      version: 2,
      isMine: true
    },
    {
      id: 'assignment-other',
      orderId: 'order-c',
      assigneeUserId: 'picker-b',
      assigneeName: 'Сборщик Б',
      assigneeEmail: 'picker-b@example.test',
      state: 'accepted',
      offeredAt: '2026-08-12T12:00:00.000Z',
      expiresAt: null,
      acceptedAt: '2026-08-12T12:00:30.000Z',
      version: 2,
      isMine: false
    },
    {
      id: 'assignment-accepted-mine',
      orderId: 'order-d',
      assigneeUserId: 'picker-a',
      assigneeName: 'Сборщик А',
      assigneeEmail: 'picker-a@example.test',
      state: 'accepted',
      offeredAt: '2026-08-12T12:00:00.000Z',
      expiresAt: '2026-08-12T12:02:00.000Z',
      acceptedAt: '2026-08-12T12:00:30.000Z',
      version: 2,
      isMine: true
    }
  ];

  it('returns only active work offered to or accepted by the current worker', () => {
    expect([...getVisibleAssignedOrderIds(assignments)]).toEqual(['order-a', 'order-d']);
  });
});
