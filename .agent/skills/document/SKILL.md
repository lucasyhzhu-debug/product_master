---
name: document
description: Document recent code changes to the appropriate docs per CLAUDE.md guidance
---

# Skill: /document

## Purpose

Sync documentation with recent code changes. Analyzes what was modified and updates the relevant documentation files (CHANGELOG.md, API_REFERENCE.md, SCHEMA.md, ROADMAP.md) following established project patterns.

## When to Use

- After completing a feature or bug fix (before PR)
- After merging code to main
- When documentation has fallen behind code changes
- User explicitly requests documentation update

## Documentation Mapping

Based on CLAUDE.md guidance, changes trigger specific doc updates:

| Change Type | Docs to Update |
|-------------|----------------|
| Any code merge | `docs/CHANGELOG.md` |
| Schema changes (`convex/schema.ts`) | `docs/SCHEMA.md` |
| New/modified Convex functions | `docs/API_REFERENCE.md` |
| Feature completed | `docs/ROADMAP.md` |
| New components/patterns | `CLAUDE.md` (Quick File Finder) |

## Workflow

### Step 1: Gather Change Context

1. **Get current branch:**
   ```bash
   git branch --show-current
   ```

2. **Get recent commits:**
   ```bash
   git log --oneline -10
   ```

3. **List modified files:**
   ```bash
   git diff --name-only main...HEAD
   ```

4. **Check for specific change types:**
   ```bash
   # Schema changes
   git diff main...HEAD -- convex/schema.ts

   # New Convex functions
   git diff main...HEAD -- "convex/*/queries.ts" "convex/*/mutations.ts"

   # New components
   git diff main...HEAD -- "src/components/**/*.tsx"
   ```

### Step 2: Determine Which Docs Need Updates

Based on modified files, identify required updates:

| Modified Path | Required Doc Update |
|--------------|---------------------|
| `convex/schema.ts` | SCHEMA.md |
| `convex/*/queries.ts` | API_REFERENCE.md (Queries section) |
| `convex/*/mutations.ts` | API_REFERENCE.md (Mutations section) |
| `src/components/**` | CLAUDE.md (if new pattern) |
| `src/pages/**` | CLAUDE.md (if new page) |
| Any code change | CHANGELOG.md |

### Step 3: Update CHANGELOG.md

**Location:** `docs/CHANGELOG.md`

**Insert at TOP of file (after header), using this format:**

```markdown
## YYYY-MM-DD - [Feature/Fix Title]

**[One-line impact summary]**

[2-3 sentence description of what changed and why]

**Changes:**
- [Change 1 with details]
- [Change 2 with details]

**Files Modified:**
- `path/to/file.ts` - [What changed]
- `path/to/other.ts` - [What changed]

**Branch:** `{branch-name}`

---
```

### Step 4: Update SCHEMA.md (if schema changed)

**Location:** `docs/SCHEMA.md`

**Format for new/modified tables:**

```markdown
### X. `tableName` - Description

```typescript
tableName: defineTable({
  fieldName: v.string(),           // Field description
  relatedId: v.id("otherTable"),   // Relationship description
})
  .index("by_field", ["fieldName"])
```

**Relationships:**
- Links to `otherTable` via `relatedId`
```

### Step 5: Update API_REFERENCE.md (if functions changed)

**Location:** `docs/API_REFERENCE.md`

**Format for queries:**

```markdown
## [Category] Queries

### `queries.functionName`
**File:** `convex/[category]/queries.ts`

```typescript
functionName({ argName: type }): ReturnType
```

**Arguments:**
- `argName` - Description

**Returns:** Description of return value

**Example:**
```typescript
const result = useQuery(api.[category].queries.functionName, { argName: value });
```
```

**Format for mutations:**

```markdown
## [Category] Mutations

### `mutations.functionName`
**File:** `convex/[category]/mutations.ts`

```typescript
functionName({ argName: type }): ReturnType
```

**Arguments:**
- `argName` - Description

**Side Effects:**
- [What the mutation changes]

**Example:**
```typescript
await mutation({ argName: value });
```
```

### Step 6: Update ROADMAP.md (if feature completed)

**Location:** `docs/ROADMAP.md`

**Move completed items from "Planned" to "Completed" section:**

```markdown
## Completed Features

### [Feature Name] ✅
- **Completed:** YYYY-MM-DD
- **Branch:** `feature/branch-name`
- **Details:** Brief description
```

### Step 7: Update CLAUDE.md (if new patterns)

**Location:** `CLAUDE.md`

**Update Quick File Finder table if:**
- New page added to `src/pages/`
- New component pattern in `src/components/`
- New hook in `src/hooks/convex/`

**Update Project Structure section if:**
- New directories created
- File counts changed significantly

## Templates

### CHANGELOG Entry Template

```markdown
## {DATE} - {Title}

**{Impact summary}**

{Description}

**Key Changes:**
- {Change 1}
- {Change 2}

**New Components:** (if applicable)
| File | Purpose |
|------|---------|
| `ComponentName.tsx` | Description |

**Files Modified:**
- `path/file.ts` - Description (+X/-Y lines)

**Branch:** `{branch-name}`

---
```

### API Function Documentation Template

```markdown
### `{category}.{type}.{functionName}`

**Purpose:** {One-line description}

**Signature:**
```typescript
{functionName}({
  arg1: type,
  arg2?: optionalType,
}): ReturnType
```

**Arguments:**
| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `arg1` | `type` | Yes | Description |
| `arg2` | `type` | No | Description |

**Returns:** `ReturnType` - Description

**Example:**
```typescript
// Usage example
```
```

## Output

After running this skill:
- CHANGELOG.md updated with new entry at top
- SCHEMA.md updated (if schema changed)
- API_REFERENCE.md updated (if functions changed)
- ROADMAP.md updated (if feature completed)
- CLAUDE.md updated (if new patterns/pages)

Report to user:
- Which docs were updated
- Summary of changes added
- Any manual review needed

## Example Invocation

User: `/document`

Claude:
1. Checks branch: `fix/kitchen-view-ui-issues`
2. Gets modified files: 7 files changed
3. Detects: No schema changes, 1 new component, bug fixes
4. Updates:
   - CHANGELOG.md: New entry for Kitchen View fixes
   - CLAUDE.md: Added FlyingBall to Quick File Finder
5. Reports: "Updated 2 docs. CHANGELOG entry added for Kitchen View UI Fixes."
