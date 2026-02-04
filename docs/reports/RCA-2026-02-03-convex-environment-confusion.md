# Root Cause Analysis Report

## Incident: Convex Environment Confusion Leading to Data Loss

| Field | Value |
|-------|-------|
| **Date Discovered** | 2026-02-03 |
| **Severity** | Critical (Data Loss) |
| **Status** | Post-mortem complete |
| **Related Incident** | [RCA-2026-02-03-kitchen-dynamic-import.md](./RCA-2026-02-03-kitchen-dynamic-import.md) |

---

## Executive Summary

A fundamental misunderstanding of Convex's dual-environment architecture led to:
1. **Unnecessary data deletion** from the working Development environment
2. **An unused Production environment** sitting empty for the entire project lifetime
3. **Deployment confusion** during a Sev-1 incident that finally revealed the misconfiguration

The user was operating under the false belief that they needed to "make room" in Development for Production data, when in reality **both environments have separate quotas** and could have been used independently.

---

## The Misconception vs Reality

### What Was Believed

```
┌─────────────────────────────────────────┐
│         Convex Free Tier                │
│  ┌─────────────────────────────────┐    │
│  │   Shared Storage Pool           │    │
│  │   ┌─────────┐  ┌─────────┐      │    │
│  │   │   Dev   │  │  Prod   │      │    │  ← WRONG: Not shared
│  │   │         │  │         │      │    │
│  │   └─────────┘  └─────────┘      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
"I need to delete Dev data to make room for Prod"
```

### What Is Actually True

```
┌─────────────────────────────────────────┐
│         Convex Free Tier                │
│                                         │
│  ┌───────────────┐  ┌───────────────┐   │
│  │  Development  │  │  Production   │   │
│  │  (separate    │  │  (separate    │   │
│  │   quota)      │  │   quota)      │   │  ← CORRECT: Independent
│  │               │  │               │   │
│  │  exciting-    │  │  decisive-    │   │
│  │  fennec-671   │  │  wombat-7     │   │
│  └───────────────┘  └───────────────┘   │
└─────────────────────────────────────────┘
"Both environments have their own storage limits"
```

---

## Current State (As of 2026-02-03)

| Environment | Deployment ID | Status | Connected To |
|-------------|---------------|--------|--------------|
| **Development** | `exciting-fennec-671` | ✅ Active, 27 tables, all business data | Vercel (`frollie-product.vercel.app`) |
| **Production** | `decisive-wombat-7` | ❌ Empty, never used | Nothing |

### The Irony

- **"Development"** is actually running production workloads
- **"Production"** has never been touched
- The labels are the opposite of the actual usage

---

## Timeline of Events

| Date | Event | Impact |
|------|-------|--------|
| Initial setup | `npx convex dev` creates `exciting-fennec-671` | Development environment created |
| Initial setup | Convex auto-creates `decisive-wombat-7` | Production environment created (unused) |
| Unknown date | Vercel connected to `exciting-fennec-671` | All production traffic goes to "Development" |
| Unknown date | User told to "delete data to make room for prod" | **Unnecessary data deletion** |
| 2026-02-03 18:17 | Sev-1: Kitchen page broken | Dynamic import error |
| 2026-02-03 18:20 | `npx convex deploy` runs | Deploys to wrong (empty) environment |
| 2026-02-03 18:24 | Multiple deploy attempts fail | Still hitting wrong environment |
| 2026-02-03 18:30 | Discovery: Vercel uses Development | **Environment confusion revealed** |
| 2026-02-03 18:30 | `npx convex dev --once` fixes the issue | Correct deployment method found |

---

## Root Causes

### 1. Misleading Environment Names

Convex uses "Development" and "Production" labels, but:
- These are just **names**, not enforced usage patterns
- Nothing prevents you from running production traffic on "Development"
- The CLI defaults (`convex dev` vs `convex deploy`) reinforce this confusion

### 2. Incorrect Mental Model

The user believed:
- Free tier = shared storage between environments
- Must choose one environment to use
- Need to "migrate" from Dev to Prod

Reality:
- Free tier = separate quotas per environment
- Can use both environments simultaneously
- No migration needed - they're independent

### 3. Documentation Gap

The project's `.env.local` file contained misleading comments:
```bash
# .env.local
# Production Environment - Your current production setup  ← MISLEADING
CONVEX_DEPLOYMENT=dev:exciting-fennec-671  ← Actually "Development"
```

### 4. No Environment Validation

There was no check to verify which environment deployments were targeting. The Sev-1 incident only surfaced because the error was obvious (page broken).

---

## Impact Assessment

### Data Loss

| Category | Impact |
|----------|--------|
| **Data deleted** | Unknown quantity - whatever was removed to "make room for prod" |
| **Recoverable?** | ❌ No - unless backups exist |
| **Business impact** | Unknown - depends on what was deleted |

### Operational Impact

| Category | Impact |
|----------|--------|
| **Sev-1 duration** | ~15 minutes |
| **Deployment confusion** | 3 failed attempts before correct method found |
| **Developer time wasted** | Multiple hours debugging |

### Ongoing Risk

| Risk | Status |
|------|--------|
| Future deployments going to wrong environment | ⚠️ High - `npx convex deploy` still targets empty Production |
| Confusion about which environment is "real" | ⚠️ High - naming is still misleading |

---

## Lessons Learned

### What Went Wrong

1. **Assumed shared storage** - No verification of how Convex quotas actually work
2. **Trusted the label** - "Development" label doesn't mean it can't run production traffic
3. **Deleted data without confirmation** - Should have verified the need first
4. **No deployment verification** - Deploy commands weren't checked against actual targets

### What Should Have Happened

1. **Verify quota model** - Check Convex docs on how free tier limits work
2. **Use Production for production** - Connect Vercel to `decisive-wombat-7` from the start
3. **Keep Development for testing** - Use `exciting-fennec-671` for dev/staging only
4. **Document the setup** - Clear documentation of which environment serves what purpose

---

## Recommendations

### Immediate Actions

- [x] Document the current environment setup
- [x] Create this RCA report
- [ ] Update `.env.local` comments to accurately reflect the situation
- [ ] Add deployment target verification to deployment process

### Short-term Actions

| Action | Priority | Effort |
|--------|----------|--------|
| Decide: Keep current setup OR migrate to Production | High | Low |
| Update CLAUDE.md with correct deployment commands | High | Low |
| Add pre-deploy check script to verify target | Medium | Medium |
| Review Convex documentation on environments | Medium | Low |

### Long-term Actions

| Action | Priority | Effort |
|--------|----------|--------|
| Consider upgrading Convex plan if hitting limits | Low | Low |
| Implement proper Dev → Staging → Prod pipeline | Low | High |
| Set up automated backups before any data deletion | High | Medium |

---

## Decision Required

You have two options going forward:

### Option A: Keep Current Setup (Recommended for now)

```
Vercel → exciting-fennec-671 (labeled "Development" but is your production)

Deploy command: npx convex dev --once
```

**Pros:**
- No migration needed
- No downtime
- All data stays where it is

**Cons:**
- Naming remains confusing
- `npx convex deploy` still goes to wrong place

### Option B: Migrate to Actual Production

```
1. Export data from exciting-fennec-671
2. Import to decisive-wombat-7
3. Update Vercel env vars to point to decisive-wombat-7
4. Use `npx convex deploy` going forward
```

**Pros:**
- Naming matches usage
- CLI defaults work correctly

**Cons:**
- Migration effort required
- Risk of data loss during migration
- Potential downtime

---

## Verification Checklist

Before any future deployment:

```bash
# 1. Check which environment you're targeting
npx convex dashboard
# Should open the CORRECT environment

# 2. Verify the deployment target in .env.local
cat .env.local | grep CONVEX_DEPLOYMENT
# Should match your Vercel environment

# 3. Use the correct deploy command
npx convex dev --once      # For exciting-fennec-671 (current production)
# NOT: npx convex deploy   # This goes to empty decisive-wombat-7
```

---

## Related Documentation

- [RCA-2026-02-03-kitchen-dynamic-import.md](./RCA-2026-02-03-kitchen-dynamic-import.md) - The Sev-1 that revealed this issue
- [Convex Environments Documentation](https://docs.convex.dev/production/hosting) - Official docs on Dev/Prod environments

---

## Key Takeaway

> **The data deletion was unnecessary.** Convex Development and Production environments have **separate quotas**. You could have used both without deleting anything from Development.

---

*Report generated: 2026-02-03*
*Author: Claude Code Assistant*
