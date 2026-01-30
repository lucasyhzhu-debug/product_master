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
npm run build                     # Frontend: verify build
cd backend && python -m pytest    # Backend: run tests
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
2. **Understand context** — Review related models, schemas, and services
3. **Check patterns** — Follow established conventions (see [CODE_STYLE.md](CODE_STYLE.md))
4. **Plan approach** — Outline the implementation strategy before writing code
5. **Ask clarifying questions** — If requirements are ambiguous, ask the user

### Implementation Process

#### 1. Planning Phase
- Outline the changes required (backend/frontend/database)
- Identify files that will be modified or created
- Consider edge cases and error scenarios
- Review related business logic (cost calculations, versioning, etc.)

#### 2. Development Phase
- Write code following established patterns and conventions
- Use type hints (Python) and TypeScript for all code
- Keep functions focused and single-responsibility
- Add inline comments only where logic isn't self-evident
- Avoid over-engineering — minimum complexity for the task
- Trust framework and internal API guarantees
- Validate only at system boundaries (user input, external APIs)

#### 3. Review Phase
- Run through the Code Review Checklist below
- Verify all tests pass (when tests are implemented)
- No linting errors
- Documentation updated

---

## Code Review Checklist

### Architecture & Design
- [ ] Does the solution follow the established patterns for this codebase?
- [ ] Are database transactions used correctly where needed?
- [ ] Is the data flow clear from frontend → API → database?
- [ ] Are relationships and foreign keys properly defined?
- [ ] Does the solution avoid N+1 queries?

### Backend (Python/FastAPI)
- [ ] All functions have type hints
- [ ] Pydantic schemas validate input/output correctly
- [ ] Error handling uses HTTPException with clear messages
- [ ] Database operations use proper session management
- [ ] CRUD operations are efficient (joinedload, selectinload for relationships)
- [ ] No circular imports or TYPE_CHECKING violations
- [ ] Cost calculations handle null values correctly
- [ ] Version copy operations do deep copies, not shallow copies

### Frontend (TypeScript/React)
- [ ] All components have explicit prop types via interfaces
- [ ] React Query hooks use proper query key factories
- [ ] Mutations invalidate relevant query caches
- [ ] useState/useReducer state is properly initialized
- [ ] No unnecessary re-renders or missing dependency arrays
- [ ] Form validation happens before API calls
- [ ] Error states are handled (loading, error, success)
- [ ] TypeScript types match backend schemas
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
- [ ] Database changes are documented in CHANGELOG.md
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
- Update RecipeVersionDetail schema
- Add cost_calculator function

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Good: Bug fix with explanation
git commit -m "fix: prevent N+1 queries in recipe list endpoint

- Add joinedload for components relationship
- Add selectinload for ingredients in components
- Reduces query count from N*M to 1 for list of N recipes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Good: Documentation update
git commit -m "docs: update CLAUDE.md with cost calculation details

- Add example calculations
- Document null yield handling
- Add common pitfalls section

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Before Committing

```bash
# 1. Verify all changes
git status                           # See what changed
git diff api/app/models/             # Review code changes
git diff src/                        # Review frontend changes

# 2. Stage relevant changes only
git add api/app/models/recipe.py
git add api/app/schemas/recipe.py
git add api/app/crud/recipes.py

# 3. Don't commit these files
# - .env files with secrets
# - __pycache__/ or node_modules/
# - Auto-generated database files
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
git add api/app/models/        # All model changes together
git commit -m "feat: add yield tracking to recipes"

# Then stage next logical group
git add api/app/schemas/      # All schema changes
git commit -m "docs: update schemas for yield tracking"

# Then API changes
git add api/app/routers/recipes.py
git commit -m "feat: expose yield in recipe endpoint"

# Then frontend
git add src/components/
git add src/hooks/
git commit -m "feat: display yield and cost per gram in UI"
```

---

## Common Code Review Issues to Avoid

### Backend
- Missing type hints → Add return type and parameter types
- Returning dicts instead of models → Return ORM models from CRUD
- Missing error handling → Add HTTPException with 4xx/5xx codes
- N+1 queries → Use joinedload/selectinload in queries
- Not flushing before using ID → Call db.flush() after db.add()
- Shallow copying relationships → Deep copy all related objects

### Frontend
- Props without interface types → Define explicit interface for all props
- Mutations without cache invalidation → Always invalidateQueries on success
- Magic strings in queries → Use query key factory pattern
- No error handling → Show error UI or toast notifications
- Inline arrays/objects in deps → Move to useMemo if dependencies needed
- TypeScript errors ignored → Fix all TypeScript errors before commit

---

## Documentation Requirements

After implementation, update relevant documentation:

**For Database Changes:**
- New tables/columns added with timestamps and indexes
- Migration or init script changes documented
- Relationship changes clearly noted

**For API Changes:**
- New endpoints documented in API_REFERENCE.md
- Response format examples provided
- Error cases listed

**For Business Logic:**
- Algorithm changes documented with examples
- Edge cases and null handling noted
- Cost calculation updates reflected

**For Frontend Changes:**
- New components documented with prop types
- Hook changes and query key updates noted
- State management changes explained
