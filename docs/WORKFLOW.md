# Development Workflow

> **Purpose:** Git workflow, code review standards, and implementation process.
> **When to read:** Before starting any new task or creating a PR.

## Table of Contents
- [Git Workflow & Version Control Rules](#git-workflow--version-control-rules)
- [Implementation & Code Review Workflow](#implementation--code-review-workflow)
- [Code Review Checklist](#code-review-checklist)
- [Common Code Review Issues to Avoid](#common-code-review-issues-to-avoid)

---

## Git Workflow & Version Control Rules

### Mandatory Code Change Workflow

**ANY code change — even minor bug fixes — MUST follow this complete workflow:**

```
1. Create new branch from main
2. Make changes & commit
3. Audit & code review
4. If works → merge back to main
5. Update docs/CHANGELOG.md
```

**This applies to:**
- Bug fixes (no matter how small)
- Feature additions
- Refactoring
- Configuration changes
- Database schema changes
- Documentation updates that accompany code

**NO EXCEPTIONS.** Do not commit directly to main. Do not skip code review.

---

### Core Principles

1. **Protect Main:** NEVER commit directly to the `main` branch. Always create a new feature branch for every task (e.g., `feature/add-login`, `fix/typo-header`).

2. **Sync First:** Before starting ANY new task or creating a branch, you must switch to `main` and run `git pull` to ensure we aren't working on outdated code.

3. **Atomic Commits:** Commit often. Do not wait until the entire feature is done. If you finish one logical step (like "added database schema"), commit it.
   - Format: `git commit -m "Verb: Context"` (e.g., "Add: User profile schema" or "Fix: Mobile navigation overflow").

4. **Verify Before Push:** Before pushing, run the project's build/test command to ensure the new code didn't break the app.

5. **Self-Correction:** If a git command fails (like a merge conflict), STOP and ask the user for guidance. Do not try to force-solve complex git conflicts on your own.

### Quick Reference

```bash
# Start new task
git switch main                    # Always start from main
git pull                          # Get latest changes
git switch -c feature/your-name   # Create feature branch

# Work on your branch
git add <files>                   # Stage specific files
git commit -m "Type: Description" # Atomic commits

# Before pushing
npm run build                     # Verify build
npm run type-check                # Verify TypeScript
git push origin feature/your-name # Push to remote

# Merge to main (after PR approval)
git switch main
git pull
git merge feature/your-name
git push origin main
```

---

## Implementation & Code Review Workflow

### Pre-Implementation Checklist

Before starting any implementation task:

1. **Read existing code** — Never propose changes without reading affected files first
2. **Understand context** — Review related Convex functions, schema, and hooks
3. **Check patterns** — Follow established conventions (see [CODE_STYLE.md](CODE_STYLE.md))
4. **Plan approach** — Outline the implementation strategy before writing code
5. **Ask clarifying questions** — If requirements are ambiguous, ask the user

### Implementation Process

#### 1. Planning Phase
- Outline the changes required (backend/frontend/schema)
- Identify files that will be modified or created
- Consider edge cases and error scenarios
- Review related business logic (cost calculations, versioning, etc.)

#### 2. Development Phase
- Write code following established patterns and conventions
- Use TypeScript for all code
- Keep functions focused and single-responsibility
- Add inline comments only where logic isn't self-evident
- Avoid over-engineering — minimum complexity for the task
- Trust framework and internal API guarantees
- Validate only at system boundaries (user input, external APIs)

#### 3. Review Phase
- Run through the Code Review Checklist below
- Verify TypeScript compiles (`npm run type-check`)
- Verify build succeeds (`npm run build`)
- Documentation updated

---

## Code Review Checklist

### Architecture & Design
- [ ] Does the solution follow established Convex patterns?
- [ ] Is the data flow clear from frontend → Convex → database?
- [ ] Are indexes properly defined for queries?
- [ ] Does the solution avoid N+1 patterns (use appropriate denormalization)?

### Convex Backend
- [ ] Schema uses correct validators (`v.string()`, `v.optional()`, etc.)
- [ ] Queries use indexes for filtered/sorted data
- [ ] Mutations validate business rules before writes
- [ ] Error handling uses thrown errors with clear messages
- [ ] Complex operations are in single mutations (transactional)
- [ ] Cost calculations handle null values correctly
- [ ] Version copy operations do deep copies, not shallow copies

### Frontend (TypeScript/React)
- [ ] All components have explicit prop types via interfaces
- [ ] Convex hooks handle loading state (`=== undefined`)
- [ ] Mutations are awaited and errors caught
- [ ] useState/useReducer state is properly initialized
- [ ] No unnecessary re-renders or missing dependency arrays
- [ ] Form validation happens before mutation calls
- [ ] Error states are handled (loading, error, success)
- [ ] TypeScript types match Convex schema
- [ ] Components are functional, not class-based
- [ ] No hardcoded magic strings or numbers

### Quality Standards
- [ ] Code is readable and self-documenting
- [ ] Variable names are clear and descriptive
- [ ] Functions are not too long (aim for <50 lines for most functions)
- [ ] No premature abstractions or over-generalization
- [ ] Minimal complexity — just enough for current requirements
- [ ] No dead code, commented-out code, or // removed comments
- [ ] No console.log or print debugging left in code

### Testing Considerations (for future test implementation)
- [ ] Is the code testable? (dependencies are injectable)
- [ ] Error paths are explicit and catchable
- [ ] Edge cases are handled (empty lists, null values, etc.)
- [ ] Calculations are correct and handle edge cases

### Documentation
- [ ] Complex logic has explanatory comments
- [ ] Schema changes are documented in CHANGELOG.md
- [ ] API changes are documented in CHANGELOG.md
- [ ] Business logic changes are explained

### Code Review Approval Gates

Code is ready for commit when:

1. **Functionality** — Works as specified without bugs
2. **Elegance** — Uses appropriate algorithms and patterns
3. **Consistency** — Follows codebase conventions
4. **Testability** — Can be tested and errors are catchable
5. **Performance** — No N+1 queries, efficient algorithms
6. **Maintainability** — Clear, documented, easy to modify
7. **Safety** — No security vulnerabilities (XSS, SQL injection, etc.)

---

## Commit Standards

### Atomic Commits
Each commit should be a single logical change:
- One feature or bug fix per commit
- No mixing refactoring with functionality
- All tests pass for each commit

### Commit Message Format
```
<type>: <subject line, max 50 chars>

<optional detailed explanation>

- Bullet points for what changed
- Keep body under 72 chars per line

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Commit Types
- `feat:` New feature or functionality
- `fix:` Bug fix
- `refactor:` Code structure changes without behavior change
- `docs:` Documentation updates (including CLAUDE.md)
- `perf:` Performance improvements
- `test:` Test additions/updates
- `chore:` Dependency updates, config changes

### Example Commits
```bash
# Good: Single focused change
git commit -m "feat: add cost per gram calculation to recipe versions

- Calculate cost per gram based on estimated yield
- Return null if yield not set
- Update recipeVersions schema with cached cost fields
- Add costCalculator helper function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Good: Bug fix with explanation
git commit -m "fix: handle null estimatedYieldGrams in cost calculation

- Check for null before division
- Return null cost instead of NaN
- Add defensive check in CostTooltip component

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Good: Documentation update
git commit -m "docs: update CLAUDE.md with Convex patterns

- Add Convex quick reference section
- Document query/mutation patterns
- Add common pitfalls section

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Before Committing

```bash
# 1. Verify all changes
git status                           # See what changed
git diff convex/                     # Review backend changes
git diff src/                        # Review frontend changes

# 2. Stage relevant changes only
git add convex/schema.ts
git add convex/recipes/mutations.ts
git add src/pages/RecipeEditor.tsx

# 3. Don't commit these files
# - .env files with secrets
# - node_modules/
# - convex/_generated/ (auto-generated)
# - dist/ (build output)
# - IDE config files (.vscode, .idea)

# 4. Review staged changes
git diff --staged

# 5. Commit with proper message (see format above)
git commit -m "..."

# 6. Verify commit
git log -1 --stat
```

### Multi-File Changes Example

When implementation spans multiple files:

```bash
# Stage by logical group
git add convex/schema.ts            # Schema changes
git commit -m "feat: add yield tracking to recipe versions"

# Then stage mutations/queries
git add convex/recipes/
git commit -m "feat: implement yield calculation in recipe queries"

# Then frontend
git add src/hooks/convex/
git add src/pages/
git commit -m "feat: display yield and cost per gram in UI"
```

---

## Common Code Review Issues to Avoid

### Convex Backend
- Missing index for filtered queries → Add `.index()` in schema
- Not handling null in calculations → Check before division
- Shallow copying relationships → Deep copy all related documents
- Not validating references exist → Check with `ctx.db.get()` before using
- Mutation not transactional → Keep related operations in single mutation

### Frontend
- Props without interface types → Define explicit interface for all props
- Not handling loading state → Check `=== undefined` before rendering
- Not awaiting mutations → Always `await` and catch errors
- Magic strings for IDs → Use proper `Id<"tableName">` types
- Inline arrays/objects in deps → Move to useMemo if dependencies needed
- TypeScript errors ignored → Fix all TypeScript errors before commit

---

## Documentation Requirements

After implementation, update relevant documentation:

**For Schema Changes:**
- New tables/fields documented in SCHEMA.md
- Index definitions noted
- Relationship changes clearly explained

**For Convex Function Changes:**
- New queries/mutations documented in API_REFERENCE.md
- Response format examples provided
- Error cases listed

**For Business Logic:**
- Algorithm changes documented with examples
- Edge cases and null handling noted
- Cost calculation updates reflected

**For Frontend Changes:**
- New components documented with prop types
- Hook usage patterns noted
- State management changes explained
