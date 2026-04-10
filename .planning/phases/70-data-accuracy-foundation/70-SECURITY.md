---
phase: 70
slug: data-accuracy-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-10
---

# Phase 70 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cron -> Action | Convex cron triggers syncInternalOrders | Server-to-server, no user input |
| Settings UI -> Action | User triggers sync/backfill via useAction | Action args (triggeredBy, forceFullSync) |
| Action -> Internal Mutations | syncInternalOrders calls saveRevenue/saveRevenueItems | Revenue data from internal DB |
| Migration -> DB | fixConfirmedOrders patches orders + inserts events | Order status changes |
| Frontend -> menuProducts.update | Admin sets COGS override via inline edit | cogsOverrideIdr number |
| Frontend -> auth.updateUser | Admin edits employee profile fields | Salary, bank holder name |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-70-01 | Spoofing | syncInternalOrders action | accept | Action unauthed by design (triggeredBy informational). Revenue source is internal DB. Existing Phase 30 pattern. | closed |
| T-70-02 | Tampering | Revenue item data | mitigate | Items generated from server-side DB queries, not client input. linkedMenuProductId from orderItems.menuProductId (server-stored). | closed |
| T-70-03 | Denial of Service | Backfill full scan | accept | ~500 orders total. Convex handles efficiently. Only triggerable by Manager/Admin (canAccessDashboard gate). | closed |
| T-70-04 | Information Disclosure | Revenue data in sync logs | accept | Sync logs store aggregate counts only, not individual order details. Established pattern. | closed |
| T-70-05 | Elevation of Privilege | Backfill button access | mitigate | SettingsTab gated by canAccessDashboard (Manager, Admin). ProtectedRoute enforcement. | closed |
| T-70-06 | Tampering | cogsOverrideIdr value | mitigate | Convex `v.number()` validator. Client-side rejects negative. menuProducts.update requires `requireRole(admin)`. | closed |
| T-70-07 | Elevation of Privilege | updateUser mutation | mitigate | `requireRole(ctx, args.token, ["admin"])` added by CR-01 fix. Server-side admin enforcement. | closed |
| T-70-08 | Information Disclosure | baseSalaryIdr field | accept | Visible to admins only (UsersManager is Admin-only page). No API exposes salary to non-admins. | closed |
| T-70-09 | Tampering | bankAccountHolderName | mitigate | Trimmed, max 100 chars (client). `v.string()` validator (server). Admin-only via requireRole. | closed |
| T-70-10 | Repudiation | COGS override changes | accept | No audit trail. Acceptable at ~10 products scale. Phase 77 can add if needed. | closed |
| T-70-11 | Tampering | fixConfirmedOrders migration | mitigate | `internalMutation` — dashboard-only. Audit trail via orderEvents. Idempotent. | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-70-01 | syncInternalOrders is unauthed but reads only internal DB data. Existing pattern. | Claude (security audit) | 2026-04-10 |
| AR-02 | T-70-03 | Full scan on ~500 orders is trivial for Convex. Access gated by UI permission. | Claude (security audit) | 2026-04-10 |
| AR-03 | T-70-04 | Sync logs are aggregate-only. No PII or financial detail exposed. | Claude (security audit) | 2026-04-10 |
| AR-04 | T-70-08 | Salary data restricted to admin-only page. No cross-role query leaks. | Claude (security audit) | 2026-04-10 |
| AR-05 | T-70-10 | COGS override audit trail deferred. ~10 products, admin-only. | Claude (security audit) | 2026-04-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-10 | 11 | 11 | 0 | Claude (gsd-secure-phase) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-10
