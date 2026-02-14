# Phase 11: Infrastructure & Consolidation - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated database backups running on schedule, all dependency versions audited and upgraded where safe, and production counts consolidated from `productionCounts` table to `productionLog`-derived aggregation. External API integrations (K3Mart, Gobiz authentication) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Backup schedule & retention
- Weekly backup using Convex scheduled function (cron)
- Storage: Convex export only (no external S3)
- Retain last 8 backups (2 months of weekly snapshots), auto-delete older
- On failure: retry once after 1 hour, log result to `backupLogs` table either way
- Backup status logged to Convex table (not dashboard widget)
- On admin login: show notification banner if most recent backup failed — user must click to dismiss

### Dependency audit scope
- Full audit: document all packages with versions, then upgrade everything possible
- Skip breaking upgrades — only apply upgrades where `npm run build` still passes
- Document skipped packages with rationale for why they were not upgraded
- Include future recommendations section with 3-6 month timeline for upcoming attention items
- Primary focus: compatibility verification (React 19 + Convex 1.31 + Vite 7 + TS 5.9)
- Secondary: security vulnerabilities (npm audit)

### Production counts consolidation
- Full replacement: all kitchen UI reads from `productionLog` aggregation, not `productionCounts`
- Stop dual-write immediately once productionLog reads are live (no transition period)
- Keep `productionCounts` table as read-only archive (do not delete from schema)
- Accept up to ~500ms slower queries if data is more accurate
- Kitchen usage pattern: starts morning, runs until late depending on demand — optimize for sustained usage, not burst

### Monitoring & integrity
- Weekly data integrity check (scheduled function) comparing productionLog totals against kitchen display expectations — log mismatches to a table
- Backup failure notification shown to admin on next login (must click OK to clear)
- Existing Convex crons already in place (cost invalidation, etc.) — new crons follow same patterns

### Claude's Discretion
- Exact Convex cron scheduling syntax and timing
- Backup export format and implementation details
- productionLog aggregation query optimization approach
- Integrity check verification method (side-by-side vs spot check vs automated comparison)
- How to surface backup failure notification on admin login (toast, banner, dialog)

</decisions>

<specifics>
## Specific Ideas

- User has external API authentication tokens for K3Mart and Gobiz dashboards — originally considered cron-based re-auth but now prefers on-the-fly API calls with stored tokens (deferred to separate phase)
- Backup failure notification should require explicit user acknowledgment (click OK to clear), not auto-dismiss

</specifics>

<deferred>
## Deferred Ideas

- External API integration (K3Mart, Gobiz website authentication and data pulling) — new capability, deserves its own phase
- Cron-based re-authentication for external services — superseded by on-the-fly auth approach, but the integration itself is out of scope

</deferred>

---

*Phase: 11-infrastructure*
*Context gathered: 2026-02-14*
