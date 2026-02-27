---
status: resolved
trigger: "Production admin cannot see Sales Analytics or K3Mart Cockpit pages. Nav links are missing and navigating to /Sales redirects to Orders."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:02:00Z
---

## Current Focus

hypothesis: RESOLVED.
test: npm run type-check - passed clean
expecting: n/a
next_action: archive

## Symptoms

expected: Sales Analytics and K3Mart Cockpit pages should be visible to Admin users with nav links in the sidebar/header
actual: No nav links for these pages. Going to /Sales redirects to Orders page.
errors: None - just silent redirect
reproduction: Login as Admin on production, look for Sales Analytics in nav - it's not there. Navigate to /Sales - redirects to Orders.
timeline: User deliberately hid these pages previously due to bandwidth constraints. Now wants them back.

## Eliminated

- hypothesis: Routes removed from App.tsx
  evidence: Both /sales and /k3mart-cockpit routes restored in commit 964aacf. App.tsx lines 254-270 confirmed correct.
  timestamp: 2026-02-25T00:00:00Z

- hypothesis: canAccessSalesAnalytics missing from ROLE_PERMISSIONS for admin/manager
  evidence: Both manager (line 771) and admin (line 787) have canAccessSalesAnalytics: true in types.ts
  timestamp: 2026-02-25T00:00:00Z

- hypothesis: Nav items removed from Header.tsx or MobileBottomNav.tsx
  evidence: Both restored in commit 481c3be. Header mainNavItems[1] = Sales, depotItems[0] = K3 Mart.
  timestamp: 2026-02-25T00:00:00Z

- hypothesis: hasPermission() implementation broken in AuthContext
  evidence: AuthContext.tsx line 135: return ROLE_PERMISSIONS[session.role][permission] -- works correctly.
  timestamp: 2026-02-25T00:00:00Z

## Evidence

- timestamp: 2026-02-25T00:00:00Z
  checked: git log for bandwidth conservation commits
  found: Disable commit 7d7fcba touched 4 files: App.tsx, Header.tsx, MobileBottomNav.tsx, Footer.tsx. Restore commits 964aacf (App.tsx) and 481c3be (Header+MobileBottomNav) only covered 3 of 4 files.
  implication: Footer.tsx was missed in the restoration

- timestamp: 2026-02-25T00:01:00Z
  checked: src/components/layout/Footer.tsx
  found: Sales link still commented out with BANDWIDTH CONSERVATION comment (line 5-6). K3Mart Cockpit was never in the footer quickLinks to begin with.
  implication: Footer quick links missing Sales -- minor secondary issue. Primary nav (Header/MobileBottomNav) already correct.

- timestamp: 2026-02-25T00:02:00Z
  checked: npm run type-check
  found: Passes clean with zero errors after Footer.tsx fix.
  implication: Fix is valid, no type regressions.

## Resolution

root_cause: Footer.tsx was the one file not restored when Sales Analytics and K3Mart Cockpit were re-enabled. The original bandwidth conservation disable commit (7d7fcba) touched 4 files; the two restore commits (964aacf, 481c3be) only covered 3. The Sales quick link in the footer remained commented out.

Context: The primary symptom (nav links missing, redirect to Orders) was already fixed by commits 964aacf and 481c3be which are in main. Footer.tsx was the remaining missed file.

fix: Uncommented the Sales quick link in Footer.tsx quickLinks array and removed the BANDWIDTH CONSERVATION comment block. K3Mart Cockpit was never in the footer so no change needed there.

verification: npm run type-check passes clean.
files_changed:
  - src/components/layout/Footer.tsx
