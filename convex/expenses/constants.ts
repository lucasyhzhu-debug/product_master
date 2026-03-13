/** All roles — any authenticated user can submit expenses. */
export const ALL_ROLES = ["kitchen", "order_staff", "manager", "admin"] as const;

/** Roles that can approve/reject expenses. */
export const APPROVER_ROLES = ["manager", "admin"] as const;
