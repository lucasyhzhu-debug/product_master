---
name: optimize_context
description: Audit and refactor project documentation to eliminate redundancy and ensure MECE (Mutually Exclusive, Collectively Exhaustive) context for agents.
---

# Skill: Context Optimization

> **Purpose**: Use this skill when the project context feels "polluted"—overwhelming agents with duplicate, conflicting, or stale information. Your goal is to restore **Lean Context Efficiency**.

## 1. The Audit Phase (MECE Check)

First, map the "Context Graph" to identify overlaps.

### Data Gathering
1.  **List the Universe**: Run `find_by_name` on:
    -   `d:/Snack Stack/snack-factory-erp/docs`
    -   `d:/Snack Stack/snack-factory-erp/context`
    -   `d:/Snack Stack/snack-factory-erp/.agent`
2.  **Identify Sources of Truth (SoT)**:
    -   *Logic/Rules* -> `context/business_rules.md` (usually)
    -   *Schema* -> `context/schema.sql`
    -   *Structure* -> `PROJECT_MAP.md`
    -   *Specs* -> `docs/specs/*.md`

### Redundancy Scanning
Look for these common "Context Smells":
-   **Shadow Docs**: Is `ARCHITECTURE.md` repeating the "Role Permissions" table found in `business_rules.md`?
-   **Stale Pointers**: Does `5_orchestrator.md` reference files that no longer exist?
-   **Over-Loading**: Is the Orchestrator reading 10 files "Before ANY Task"? (It should be reading 1 or 2, then conditional loading).

## 2. The Refactor Phase (Execution)

### A. Establish Pointers
Replace duplicated content with **pointers** to the Source of Truth.
-   *Bad*: Defining the "FIFO Rule" in both `ARCHITECTURE.md` and `business_rules.md`.
-   *Good*: `ARCHITECTURE.md` says "See `business_rules.md` for FIFO logic."

### B. Implement "Just-in-Time" Loading
Refactor the Orchestrator (`.agent/personas/5_orchestrator.md`) to use **Conditional Context**.

```markdown
### Context Initialization
1. **Always Read**: 
   - `PROJECT_MAP.md` (Structure)
   - `.agent/rules/DO_NOT_DO.md` (Constraints)
   
2. **Conditional Context** (Load only if relevant):
   - **Logic**: `context/business_rules.md` (if touching logic)
   - **UI**: `docs/UI_UX_GUIDELINES.md` (if modifying components)
```

### C. Dynamic Workflows
Ensure the Orchestrator doesn't hardcode workflows. It should point to the directory:
> "Check `.agent/workflows/` for available scripts."

## 3. The Report
Always conclude this skill by generating a `CONTEXT_OPTIMIZATION_REPORT.md`:

```markdown
# Context Optimization Report
## Removed Redundancies
- Deleted "Role Table" from Architecture (duplicated in Rules).
- Deleted "API List" from Readme (duplicated in Swagger).

## Structural Changes
- Updated Orchestrator to load UI docs conditionally.

Signed,
Context Optimizer
```

## When to Run This Skill
-   **Onboarding**: When you first join a messy project.
-   **Post-Major-Refactor**: After a large changelist, documents often drift.
-   **Confusion**: If you (the agent) find yourself hallucinating based on conflicting instructions.
