import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../../src/lib/types';

describe('ROLE_PERMISSIONS - expense permission flags', () => {
  describe('canSubmitExpenses', () => {
    it('kitchen can submit expenses', () => {
      expect(ROLE_PERMISSIONS.kitchen.canSubmitExpenses).toBe(true);
    });
    it('order_staff can submit expenses', () => {
      expect(ROLE_PERMISSIONS.order_staff.canSubmitExpenses).toBe(true);
    });
    it('manager can submit expenses', () => {
      expect(ROLE_PERMISSIONS.manager.canSubmitExpenses).toBe(true);
    });
    it('admin can submit expenses', () => {
      expect(ROLE_PERMISSIONS.admin.canSubmitExpenses).toBe(true);
    });
  });

  describe('canApproveExpenses', () => {
    it('kitchen cannot approve expenses', () => {
      expect(ROLE_PERMISSIONS.kitchen.canApproveExpenses).toBe(false);
    });
    it('order_staff cannot approve expenses', () => {
      expect(ROLE_PERMISSIONS.order_staff.canApproveExpenses).toBe(false);
    });
    it('manager can approve expenses', () => {
      expect(ROLE_PERMISSIONS.manager.canApproveExpenses).toBe(true);
    });
    it('admin can approve expenses', () => {
      expect(ROLE_PERMISSIONS.admin.canApproveExpenses).toBe(true);
    });
  });

  describe('canManageReimbursements', () => {
    it('kitchen cannot manage reimbursements', () => {
      expect(ROLE_PERMISSIONS.kitchen.canManageReimbursements).toBe(false);
    });
    it('order_staff cannot manage reimbursements', () => {
      expect(ROLE_PERMISSIONS.order_staff.canManageReimbursements).toBe(false);
    });
    it('manager cannot manage reimbursements', () => {
      expect(ROLE_PERMISSIONS.manager.canManageReimbursements).toBe(false);
    });
    it('admin can manage reimbursements', () => {
      expect(ROLE_PERMISSIONS.admin.canManageReimbursements).toBe(true);
    });
  });

  describe('canAccessExpenseAnalytics', () => {
    it('kitchen cannot access expense analytics', () => {
      expect(ROLE_PERMISSIONS.kitchen.canAccessExpenseAnalytics).toBe(false);
    });
    it('order_staff cannot access expense analytics', () => {
      expect(ROLE_PERMISSIONS.order_staff.canAccessExpenseAnalytics).toBe(false);
    });
    it('manager can access expense analytics', () => {
      expect(ROLE_PERMISSIONS.manager.canAccessExpenseAnalytics).toBe(true);
    });
    it('admin can access expense analytics', () => {
      expect(ROLE_PERMISSIONS.admin.canAccessExpenseAnalytics).toBe(true);
    });
  });
});
