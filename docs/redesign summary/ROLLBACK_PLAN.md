# Order Form Redesign - Rollback Plan

**Document Version:** 1.0
**Last Updated:** 2026-02-04
**Feature:** Order Form Redesign V2 (Terracotta Theme)
**Feature Flag:** `order_form_redesign`

---

## Quick Reference

### Instant Rollback (< 1 minute)

**Option 1: Browser Console (Per-User)**
```javascript
// Disable redesign for current user
localStorage.setItem('ff_order_form_redesign', 'false');
location.reload();
```

**Option 2: Global Rollback (All Users)**
1. Change default in `src/lib/featureFlags.ts`:
   ```typescript
   order_form_redesign: false,  // Was true, changed to false
   ```
2. Deploy to production
3. All users will see old form on next page load

---

## Rollback Triggers

Initiate rollback if ANY of the following occur:

### Critical (Immediate Rollback)
- [ ] Order creation fails completely (mutation errors)
- [ ] Payment/voucher processing broken
- [ ] Form crashes or shows blank screen
- [ ] Data loss or corruption reported

### High Priority (Rollback within 2 hours)
- [ ] Error rate increases >10% compared to baseline
- [ ] Order completion rate drops >5%
- [ ] 3+ critical bug reports within 24 hours
- [ ] Voucher system not functioning

### Medium Priority (Rollback within 24 hours)
- [ ] User satisfaction score <7/10 in first week
- [ ] Significant negative feedback from sales team
- [ ] Performance issues (slow loading, animation jank)
- [ ] Accessibility complaints

---

## Rollback Execution Steps

### Step 1: Disable Feature Flag (5 minutes)

**For immediate effect on a single user:**
```javascript
// Run in browser console
localStorage.setItem('ff_order_form_redesign', 'false');
location.reload();
```

**For all users via code change:**
1. Edit `src/lib/featureFlags.ts`:
   ```typescript
   const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
     order_form_redesign: false,  // Set to false
   };
   ```
2. Commit and push:
   ```bash
   git add src/lib/featureFlags.ts
   git commit -m "rollback: disable order form redesign"
   git push origin main
   ```
3. Wait for CI/CD to deploy (typically 2-3 minutes)

### Step 2: Verify Rollback (2 minutes)

1. Open the Orders page in a new incognito/private window
2. Click "New Order"
3. Verify the OLD form is displayed (no terracotta colors, single column layout)
4. Create a test order to confirm functionality

### Step 3: Monitor Stability (30 minutes)

1. Watch Convex dashboard for error rates
2. Check browser console for React errors
3. Verify order creation is working
4. Confirm voucher system functioning

### Step 4: Post-Rollback Communication

**Slack Message Template:**
```
:warning: Order Form Rollback Completed

The new order form has been rolled back to the previous version due to [REASON].

**What happened:**
- [Brief description of issue]

**Current status:**
- Old order form is now active for all users
- Order creation is working normally

**Next steps:**
- Investigating root cause
- Will provide update within [X] hours

Please report any issues in #orders-support
```

---

## Root Cause Analysis

After rollback, document the following:

### Issue Report Template

```markdown
## Rollback Incident Report

**Date:** [Date]
**Time of rollback:** [Time]
**Reported by:** [Name]

### Issue Description
[What was the problem?]

### Impact
- Number of users affected: [N]
- Duration of issue: [X minutes/hours]
- Orders impacted: [N]

### Root Cause
[What caused the issue?]

### Fix Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Re-deployment Criteria
- [ ] Root cause fixed
- [ ] Fix tested locally
- [ ] Fix tested in staging (if available)
- [ ] Internal team approval
- [ ] Gradual rollout plan confirmed

### Lessons Learned
[What can we do to prevent this in the future?]
```

---

## Re-Enabling After Rollback

### Prerequisites
- [ ] Root cause identified and fixed
- [ ] Fix deployed to production
- [ ] Internal testing completed
- [ ] Approval from CTO/Product Manager

### Re-Enablement Steps

1. **Start with internal team only:**
   ```javascript
   // Internal team members run in console
   localStorage.setItem('ff_order_form_redesign', 'true');
   location.reload();
   ```

2. **If stable after 24 hours, enable for 10%:**
   - Update default to `true` for 10% of users
   - Monitor for 48 hours

3. **Gradually increase:**
   - 10% -> 20% -> 50% -> 100%
   - Each stage: 48-72 hours of monitoring

---

## Contact Information

### Escalation Path
1. **First responder:** On-call developer
2. **Escalation 1:** Tech Lead / Senior Developer
3. **Escalation 2:** CTO
4. **Business escalation:** Product Manager

### Support Channels
- **Slack:** #orders-support
- **GitHub Issues:** product_master repo
- **Emergency:** [Contact details]

---

## Appendix: Feature Flag Reference

### Enable Redesign
```javascript
localStorage.setItem('ff_order_form_redesign', 'true');
location.reload();
```

### Disable Redesign
```javascript
localStorage.setItem('ff_order_form_redesign', 'false');
location.reload();
```

### Check Current State
```javascript
localStorage.getItem('ff_order_form_redesign');
// Returns 'true', 'false', or null (uses default)
```

### Reset to Default
```javascript
localStorage.removeItem('ff_order_form_redesign');
location.reload();
```

### View All Feature Flags
```javascript
// In browser console, after importing
import { getAllFeatureFlags } from '@/lib/featureFlags';
console.table(getAllFeatureFlags());
```

---

**Document maintained by:** Development Team
**Last tested:** [Date of last rollback drill]
