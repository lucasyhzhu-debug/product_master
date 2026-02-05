# /validate-plan Skill

## Purpose
Validate an implementation plan against the mandatory requirements defined in CLAUDE.md before starting implementation.

## Usage
```
/validate-plan [path-to-plan]
```

If no path provided, prompt user to select from `docs/plans/` or provide a path.

## Validation Checklist

Check for the presence and completeness of these REQUIRED sections:

### 1. Git Workflow Section
- [ ] Section header exists (`## Git Workflow` or similar)
- [ ] Branch name specified (`feature/{name}` or `fix/{name}`)
- [ ] Checkpoint strategy defined with commit messages
- [ ] No direct commits to main acknowledged

### 2. Implementation Waves Section
- [ ] Section header exists (`## Implementation Waves` or similar)
- [ ] Waves are numbered (Wave 1, Wave 2, etc.)
- [ ] Each wave has agents assigned
- [ ] File paths specified per task
- [ ] Execution mode marked (PARALLEL or SEQUENTIAL)

### 3. Documentation Updates Section
- [ ] Section header exists (`## Documentation Updates` or similar)
- [ ] CHANGELOG.md checkbox present
- [ ] Conditional docs identified (SCHEMA.md, API_REFERENCE.md, ROADMAP.md)

### 4. Success Criteria Section
- [ ] Section header exists (`## Success Criteria` or similar)
- [ ] Type check requirement (`npm run type-check`)
- [ ] Build requirement (`npm run build`)
- [ ] Feature-specific criteria defined

## Execution Steps

1. **Read the plan file**
   ```
   Read {plan-path}
   ```

2. **Check each required section**
   - Search for section headers
   - Validate content within each section
   - Note missing or incomplete sections

3. **Auto-complete missing sections**

   **If ANY section is missing:** Generate it automatically using:
   - Project context from CLAUDE.md
   - The plan's stated goals and scope
   - Best practices for the feature type
   - Available specialist agents

   **Do NOT ask permission. Just complete the plan.**

4. **Generate validation report**

   **If ALL sections were already present:**
   ```
   ✅ PLAN VALIDATED

   All required sections present:
   - [x] Git Workflow
   - [x] Implementation Waves
   - [x] Documentation Updates
   - [x] Success Criteria

   Ready for implementation.
   ```

   **If sections were added (auto-completed):**
   ```
   ✅ PLAN COMPLETED

   Original plan was missing:
   - Git Workflow
   - Success Criteria

   Added sections below. Review and adjust if needed:

   ---
   ## Git Workflow
   **Branch:** `feature/{inferred-from-plan-title}`

   **Checkpoint Strategy:**
   - [ ] Checkpoint 1: After backend changes - `feat: add {x} schema/queries`
   - [ ] Checkpoint 2: After frontend changes - `feat: add {x} UI`
   - [ ] Final: After build passes - ready for merge

   ## Success Criteria
   - [ ] `npm run type-check` passes
   - [ ] `npm run build` succeeds
   - [ ] {Feature-specific criteria inferred from plan}
   ---

   Ready for implementation.
   ```

5. **Offer next steps (don't block)**
   - "Plan is ready. Shall I proceed with implementation?"
   - Or if called standalone: "Plan validated. Use /staffreview for detailed review or proceed with implementation."

## Pattern Matching

Look for these patterns when validating:

**Git Workflow patterns:**
- `## Git Workflow`
- `**Branch:**` or `Branch:`
- `Checkpoint` or `checkpoint`
- `feature/` or `fix/`

**Implementation Waves patterns:**
- `## Implementation` or `## Waves`
- `Wave 1` or `### Wave`
- `| Agent |` (table format)
- `PARALLEL` or `SEQUENTIAL`

**Documentation Updates patterns:**
- `## Documentation`
- `CHANGELOG` or `changelog`
- `- [ ]` checkboxes

**Success Criteria patterns:**
- `## Success` or `## Criteria`
- `type-check` or `typecheck`
- `build`
- `- [ ]` checkboxes

## When to Use

- Before starting implementation of ANY plan
- After writing a new plan (self-validation)
- When inheriting a plan from another developer
- When reviewing plans during /staffreview
