---
name: staffreview
description: Review implementation plans from the perspective of senior engineers (Staff and Principal level) to catch issues before implementation
---

# Skill: /staffreview

## Purpose

Simulate a rigorous code review session where two senior engineers review an implementation plan. This skill assumes the plan was written by a junior developer and provides constructive, thorough feedback to catch issues BEFORE implementation begins.

### Review Personas

1. **10x Staff Developer** - Focuses on implementation elegance, code patterns, duplication avoidance, and practical execution
2. **10x Principal Developer** - Focuses on architecture, schema flows, logic correctness, and system-wide implications

## When to Use

- Before starting implementation of any plan
- After writing a new implementation plan (self-review)
- When inheriting a plan from another developer
- User explicitly requests a plan review

## Workflow

### Step 1: Plan Discovery & Initial Read

**If path argument provided:**
```
/staffreview docs/plans/my-plan.md
```
Read the specified file directly.

**If no path argument:**
1. List available plans:
   ```bash
   ls -la docs/plans/
   ```
2. Present numbered list to user for selection
3. Wait for user to select a plan file

**Read the selected plan completely before proceeding.**

### Step 2: Gather Project Context

Before reviewing, gather essential project context:

1. **Read CLAUDE.md** - Project overview, file paths, business rules
2. **Read docs/CODE_STYLE.md** - Coding conventions and patterns
3. **Read docs/SCHEMA.md** - Database schema and data flows (if plan involves data)

### Step 3: Staff Developer Review

Adopt the persona of a **10x Staff Developer** with deep implementation experience.

#### 3.1 Duplication Check
Search the codebase for existing implementations:
```bash
# Search for similar patterns mentioned in the plan
grep -r "relevant_pattern" src/ convex/
```

**Questions to answer:**
- Does this plan duplicate existing code/patterns?
- Are there existing utilities, components, or helpers that can be leveraged?
- Does the plan reference or reuse existing abstractions?

#### 3.2 Implementation Elegance
Analyze the proposed implementation approach:
- Is there a simpler, more elegant solution?
- Are there unnecessary abstractions or over-engineering?
- Does the complexity match the problem?

#### 3.3 Pattern Consistency
Check against project patterns:
- Does it follow Convex backend patterns from CODE_STYLE.md?
- Does it use the two-tier helper architecture for orders (if applicable)?
- Are component structures consistent with existing patterns?
- Does it follow responsive design patterns (280px minimum width)?

#### 3.4 Code Reuse Opportunities
Identify specific opportunities:
- Existing components that could be extended
- Shared utilities in `src/lib/` or `convex/lib/`
- Similar implementations in other modules

#### 3.5 Practical Execution Assessment
- Is the step ordering sensible?
- Are dependencies between steps clear?
- Are there blocking dependencies that could cause delays?
- Is the scope realistic for the stated timeline (if any)?

#### 3.6 Testing Strategy
- Are test checkpoints included at each phase?
- Is there a clear verification strategy?
- Are edge cases considered in testing?

#### 3.7 Git Workflow Compliance
Check that the plan includes proper version control practices:
- Does the plan specify creating a feature branch before starting?
- Are there clear commit checkpoints with atomic commits?
- Does each phase have a commit message template following `<type>: <description>` format?
- Is there a build/type-check verification step before pushing?
- Is the merge-to-main strategy clear (after review, not direct commits)?
- Are multi-file changes grouped into logical commits?

**Questions to answer:**
- Will this plan result in clean, atomic commits?
- Are there natural commit boundaries in the implementation steps?
- Is the plan structured to avoid large, mixed commits?

### Step 4: Principal Developer Review

Adopt the persona of a **10x Principal Developer** with architectural oversight.

#### 4.1 Schema Flow Validation
If the plan involves database changes:
- Cross-reference with docs/SCHEMA.md
- Do the data flows make sense?
- Are indexes properly considered?
- Are there denormalization needs?
- Is the relationship modeling correct (1:N, M:N)?

#### 4.2 Logic Correctness
Sense-check all business logic:
- Are calculations correct?
- Are state transitions valid?
- Are there race conditions or concurrency issues?
- Does the logic align with existing business rules in CLAUDE.md?

#### 4.3 Architecture Fit
- Does this fit the Convex + React architecture?
- Does it follow the layer responsibilities (frontend, hooks, queries, mutations)?
- Will it scale with the existing system?
- Does it introduce technical debt?

#### 4.4 Edge Cases
Identify missing edge cases:
- Null/undefined handling
- Empty state handling
- Error boundaries
- Concurrent user scenarios
- Data consistency scenarios

#### 4.5 Performance Implications
- Will this cause N+1 query problems?
- Are there expensive computations that should be denormalized?
- Will real-time subscriptions create too much traffic?
- Are there opportunities for batching or caching?

#### 4.6 Security Considerations
- Are there authorization checks needed?
- Is sensitive data handled properly?
- Are there input validation gaps?

#### 4.7 Documentation Checkpoints
- Are there clear documentation milestones?
- Should SCHEMA.md be updated?
- Should CLAUDE.md be updated?
- Are there API changes that need documentation?

#### 4.8 Git & CI/CD Integration
Review version control strategy at an architectural level:
- Is there a rollback strategy if the implementation fails?
- Are there deployment checkpoints (local dev → staging → production)?
- Does the plan consider CI/CD triggers (what runs on push to main)?
- Are there any schema migrations that need special deployment ordering?
- Should data backups be taken before certain phases?
- Are there hotfix considerations if bugs are discovered mid-implementation?

**Questions to answer:**
- Can this implementation be safely reverted if issues occur?
- Is the deployment sequence correct (backend before frontend, migrations first)?
- Will CI catch the issues before production if something goes wrong?

### Step 5: Generate Consolidated Recommendations

Create a structured review report with these sections:

```markdown
# Staff Review: {Plan Name}

**Date:** {YYYY-MM-DD}
**Plan:** `{path/to/plan.md}`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** {Approve / Revise / Major Rework}

{2-3 sentence summary of the plan quality and main concerns}

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | {Issue description} | {Schema/Logic/Security/etc.} | {Section/Phase} |

**Details:**

### Issue 1: {Title}
{Detailed explanation of the issue}

**Recommendation:** {Specific fix}

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | {Improvement} | {High/Medium/Low} | {High/Medium/Low} |

**Details:**

### Improvement 1: {Title}
{Explanation and recommendation}

---

## 4. Refinements (Minor Suggestions)

Nice-to-have improvements that are not blocking.

- {Suggestion 1}
- {Suggestion 2}

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| {Component/function} | `{path}` | {Brief explanation} |

### Potential Duplication Risks
- {Risk 1}
- {Risk 2}

---

## 6. Phase/Wave Accuracy

Assessment of the implementation phases:

| Phase | Assessment | Notes |
|-------|------------|-------|
| {Phase 1 name} | {Good/Needs Adjustment} | {Notes} |

**Ordering Issues:**
- {Any phase ordering problems}

**Missing Phases:**
- {Any phases that should be added}

---

## 7. Specialist Agent Recommendations

Which agents should handle each phase of implementation:

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| {Phase 1} | `{agent-name}` | {Why this agent} |

**Available Agents:**
- `convex-backend` - Backend mutations, queries, schema changes
- `react-ui-builder` - Frontend components, pages, hooks
- `code-auditor` - Code review, quality checks
- `cto-orchestrator` - Cross-cutting concerns, major decisions
- `refactor-architect` - Refactoring, restructuring

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | {✅ Yes / ❌ No / ⚠️ Implicit} |
| Branch naming convention | {✅ Correct / ❌ Missing / ⚠️ Unclear} |
| Merge strategy documented | {✅ Yes / ❌ No} |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| {Phase 1} | {Number} | {feat/fix/refactor} | {Are these atomic?} |

### Recommended Commit Checkpoints
The plan should commit at these natural boundaries:
1. {After schema changes} → `feat: add X field to Y table`
2. {After backend logic} → `feat: implement X calculation`
3. {After frontend} → `feat: display X in Y component`
4. {After tests} → `test: add tests for X feature`

### Pre-Push Verification
- [ ] Plan includes `npm run build` check
- [ ] Plan includes `npm run type-check` verification
- [ ] Plan includes local testing before push

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | {✅ Documented / ❌ Missing} |
| Deployment order | {✅ Correct / ⚠️ Needs adjustment} |
| Data backup needed | {Yes/No} |
| Migration safety | {✅ Safe / ⚠️ Review needed} |

### Git Workflow Issues Found
- {Issue 1: e.g., "No commit checkpoints between phases"}
- {Issue 2: e.g., "Missing branch creation step"}

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| {Phase} | {docs/SCHEMA.md, docs/CODE_STYLE.md, etc.} |

### CHANGELOG.md Entry (Draft)
```markdown
## {Date} - {Feature Name}

**{Brief description}**

- {Change 1}
- {Change 2}

**Files Modified:**
- {file1}
- {file2}

**Commits:**
- {hash} - {type}: {description}
```

---

## 10. Edge Cases to Address

The plan should explicitly handle:

- [ ] {Edge case 1}
- [ ] {Edge case 2}
- [ ] {Edge case 3}

---

## 11. Approval Conditions

**For Approval, address:**
1. {Critical issue 1}
2. {Critical issue 2}

**Recommended before implementation:**
1. {Improvement 1}
2. {Improvement 2}

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
```

### Step 6: Save Report (Optional)

If the review contains significant findings:

1. Create output directory if needed:
   ```bash
   mkdir -p docs/reviews
   ```

2. Write the review file:
   **Location:** `docs/reviews/staffreview-{plan-name}-{YYYY-MM-DD}.md`

3. Inform user of file location

### Step 7: Present Summary

Show the user:
1. Overall assessment (Approve/Revise/Major Rework)
2. Count of Critical/Improvement/Refinement items
3. Top 3 most important findings
4. Next steps recommendation

## Output

After running this skill, the user should have:
- Clear understanding of plan quality
- Specific actionable items to address
- Prioritized list of issues by severity
- Agent recommendations for implementation
- Optionally: A saved review file at `docs/reviews/staffreview-{plan-name}-{date}.md`

## Review Severity Definitions

| Severity | Definition | Action Required |
|----------|------------|-----------------|
| **Critical** | Would cause implementation failure, data loss, or security issues | Must fix before implementation |
| **Improvement** | Would significantly improve quality, performance, or maintainability | Strongly recommended |
| **Refinement** | Minor enhancements, style improvements, nice-to-haves | Optional, at implementer's discretion |

## Example Invocation

**With path:**
```
User: /staffreview docs/plans/add-inventory-tracking.md

Claude:
1. Reads the plan file
2. Gathers project context (CLAUDE.md, CODE_STYLE.md, SCHEMA.md)
3. Performs Staff Developer review (implementation focus)
4. Performs Principal Developer review (architecture focus)
5. Generates consolidated report
6. Saves to docs/reviews/staffreview-add-inventory-tracking-2026-02-02.md
7. Reports: "Review complete. Assessment: Revise. Found 2 critical, 4 improvements, 3 refinements."
```

**Without path:**
```
User: /staffreview

Claude:
1. Lists available plans in docs/plans/
2. User selects: "2" (order-system-v2-mini-prds.md)
3. Proceeds with review workflow
```

## Review Mindset

**Staff Developer thinks:**
- "How would I actually build this?"
- "Is this the simplest solution?"
- "What existing code can we reuse?"
- "Will this be easy to maintain?"
- "Where are the natural commit boundaries?"
- "Can I commit and verify incrementally?"

**Principal Developer thinks:**
- "Does this fit our architecture?"
- "What could go wrong at scale?"
- "Are we making the right trade-offs?"
- "Will future developers understand this?"
- "Can we safely roll this back if it fails?"
- "Is the deployment sequence correct?"

## Common Issues to Watch For

### Schema Issues
- Missing indexes for common queries
- Denormalization inconsistencies
- Relationship modeling errors
- Missing fields that business logic requires

### Implementation Issues
- Duplicating existing utilities
- Not using established patterns
- Over-engineering simple features
- Under-engineering complex features
- Missing error handling

### Architecture Issues
- Breaking layer boundaries
- Creating tight coupling
- Ignoring real-time implications
- Missing authorization checks

### Documentation Issues
- No test verification steps
- Missing schema update plans
- Unclear success criteria
- No rollback strategy

### Git Workflow Issues
- No feature branch creation step at the start
- Large mixed commits instead of atomic commits
- Missing build verification before push
- Direct commits to main implied
- No commit checkpoints between implementation phases
- Missing CHANGELOG.md update requirement
- No deployment order consideration for schema changes
- Missing rollback strategy for failed deployments

## Integration with Other Skills

- After `/staffreview` finds issues, user may run `/handover` if session is ending
- `/techdebt` can be run after implementation to verify no new debt was introduced
- Implementation agents (`convex-backend`, `react-ui-builder`) should reference the review findings
