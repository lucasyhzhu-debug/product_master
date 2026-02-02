# Pull Request

## Description
<!-- Brief description of what this PR does -->


## Type of Change
<!-- Check all that apply -->
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring (code restructuring without behavior change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Configuration/Infrastructure change

---

## 🚨 MANDATORY: Documentation Checklist

**ALL applicable items must be checked before merging:**

### Required for ALL Merges
- [ ] **CHANGELOG.md updated** with entry for this change
  - [ ] Date and descriptive title added
  - [ ] Summary of changes included
  - [ ] Modified files listed (if significant)
  - [ ] Migration steps documented (if applicable)

### Required for Specific Changes
- [ ] **SCHEMA.md updated** (if database schema changed)
  - New tables, fields, indexes, or statuses documented
  - Workflow diagrams updated (if order status changed)

- [ ] **ROADMAP.md updated** (if feature completed)
  - Completed feature marked with [x]
  - Version history updated (if milestone reached)

- [ ] **API_REFERENCE.md updated** (if backend functions changed)
  - New queries/mutations documented
  - Function signatures and examples provided

---

## Code Review Checklist

### Architecture & Quality
- [ ] Code follows established patterns ([CODE_STYLE.md](../docs/CODE_STYLE.md))
- [ ] No premature abstractions or over-engineering
- [ ] Functions are focused and single-responsibility
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)

### Convex Backend (if applicable)
- [ ] Schema uses correct validators
- [ ] Queries use appropriate indexes
- [ ] Mutations are transactional
- [ ] Error handling is clear and explicit
- [ ] Cost calculations handle null values

### Frontend (if applicable)
- [ ] Props have explicit TypeScript interfaces
- [ ] Convex hooks handle loading state (`=== undefined`)
- [ ] Mutations are awaited and errors caught
- [ ] Components handle loading/error/success states
- [ ] No console.log or debugging code left in

### Security & Performance
- [ ] No security vulnerabilities (XSS, injection, etc.)
- [ ] No N+1 query patterns
- [ ] Efficient algorithms used
- [ ] No memory leaks or performance regressions

---

## Testing

### Manual Testing Performed
<!-- Describe what you tested manually -->
- [ ] Tested in development environment
- [ ] Verified UI renders correctly
- [ ] Verified error handling works
- [ ] Tested edge cases (empty data, null values, etc.)

### Automated Tests (if applicable)
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] All tests pass (`npm test`)

---

## Related Issues
<!-- Link to related issues or PRs -->
Closes #
Related to #

---

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->


---

## Deployment Notes
<!-- Any special deployment considerations? -->
- [ ] No database migration required
- [ ] No breaking changes
- [ ] No environment variable changes needed

OR

- [ ] Database migration required: <!-- explain -->
- [ ] Breaking changes: <!-- explain -->
- [ ] Environment variables needed: <!-- list -->

---

## Additional Context
<!-- Any other information reviewers should know -->


---

## Pre-Merge Verification

**Before clicking "Merge", verify:**
- [ ] All checkboxes above are complete
- [ ] CHANGELOG.md is updated
- [ ] Documentation is current
- [ ] Build passes
- [ ] Code has been reviewed
- [ ] Branch is up-to-date with main

---

**Documentation is MANDATORY. If incomplete, this PR should not be merged.**

See [WORKFLOW.md](../docs/WORKFLOW.md) for detailed documentation requirements.
