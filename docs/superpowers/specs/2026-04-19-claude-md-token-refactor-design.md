# CLAUDE.md Token Refactor — Design Spec

**Date:** 2026-04-19
**Status:** Approved, awaiting implementation plan
**Scope:** Pure token-reduction refactor of `CLAUDE.md` — no content updates, no reorganization for humans, no accuracy corrections.

---

## Problem

`CLAUDE.md` is loaded into context on every Claude Code turn. Current size:

- **534 lines / 34,175 bytes**
- Roughly ~8,500 tokens per turn, every turn

Three specific bloat categories have been identified:

1. **Reference content that belongs in `docs/`** — Project Structure tree (~115 lines), Quick File Finder table (~65 lines), Critical File Paths (~20 lines).
2. **Redundant content** — Tech Stack table (already in `package.json`), Convex Quick Reference (belongs in `docs/API_REFERENCE.md`), Custom Commands section (discoverable via `/` menu), Agents table (discoverable in `.claude/agents/`).
3. **Duplicated prose** — Git Workflow explains "doc-only commits" three times in slightly different forms.

Neither `claude-md-improver` nor `/revise-claude-md` is designed for size-focused refactoring — both are additive skills. This refactor is one-off compression.

## Goal

Reduce `CLAUDE.md` to **~200 lines / ~12KB** (~65% reduction) without losing any load-bearing content. Load-bearing means: rules Claude must follow, gotchas Claude can't derive from code, and project-specific domain knowledge.

## Non-goals

- No content accuracy fixes (schema count is wrong — 65 vs 59 — but staying out of scope).
- No restructuring for human readability.
- No changes to `~/.claude/CLAUDE.md` (global user file).
- No changes to memory files.
- No changes to other CLAUDE.md files if any exist in subdirectories.

## What stays in CLAUDE.md

| Section | Why keep | Action |
|---|---|---|
| Project Overview | Identity | Trim 5 → 2 lines |
| Commands | Compact, copy-paste-ready | Keep as-is |
| Environments | Critical deployment info | Keep |
| Git Workflow | Rules (non-derivable) | **Dedupe** — 65 → ~25 lines, one canonical table instead of 3 prose blocks |
| Planning Requirements template | Enforced workflow | Keep |
| Access Control summary | Quick role lookup | 30 → 8 lines (roles + pointer to full table) |
| Key Business Rules | Project-specific domain knowledge | Keep all 13 rules |
| Common Pitfalls | Highest-value content in the file | Keep all 15, light compression only |
| Documentation Index | Navigation hub | Keep |
| Environment Variables | Reference table | Keep (4 lines) |

## What moves out

| Content | New home | Notes |
|---|---|---|
| Project Structure ASCII tree (~115 lines) | `docs/ARCHITECTURE.md` | Verify coverage before removing; patch gaps if needed |
| Quick File Finder table (~65 lines) | `docs/FILE_MAP.md` (new file) | CLAUDE.md keeps a one-line pointer |
| Critical File Paths (~20 lines) | Merge into `docs/ARCHITECTURE.md` | |
| Tech Stack table (~15 lines) | **Delete** | Redundant with `package.json` + `docs/ARCHITECTURE.md` |
| Convex Quick Reference code block (~35 lines) | `docs/API_REFERENCE.md` | Verify not already present; add if missing |
| Custom Commands section (~25 lines) | **Delete** | Discoverable via `/` menu + `.claude/commands/` directory |
| Agents table (~15 lines) | **Delete** | Discoverable in `.claude/agents/` directory |

## What gets compressed (stays in file)

1. **Git Workflow** — the three overlapping explanations of "doc-only commits" collapse into one canonical table listing (a) doc-only paths, (b) workflows that always produce doc-only output. Rule content stays; duplication goes.
2. **Common Pitfalls** — examples that only restate the rule are dropped. E.g., pitfall #11 on `productionType/productionUnits` currently has six lines of explanation that can become two without losing the rule or the "always derive from BOM" guidance.

## Safety rails

- **Pitfalls are load-bearing** — all 15 numbered pitfalls are preserved with meaning intact. Compression is mechanical only: drop redundant examples, keep the rule and the *why*.
- **Git workflow rules preserved in full** — the branch-per-phase rule, the doc-only carve-out rules, and the `npm run build` gate all remain. Only the prose duplication is removed.
- **Business rules preserved in full** — all 13 numbered business rules stay.
- **Nothing is orphaned** — every extracted section gets a pointer line in CLAUDE.md's Documentation Index. No dangling references.

## Migration order

The order matters: docs files are patched *before* CLAUDE.md shrinks, so there is never a window where content is missing from both places.

1. Audit `docs/ARCHITECTURE.md`, `docs/API_REFERENCE.md`, and `docs/SECURITY.md` for content coverage gaps against what will be extracted.
2. Create `docs/FILE_MAP.md` with Quick File Finder content (verbatim copy).
3. Patch `docs/ARCHITECTURE.md` with Project Structure tree and Critical File Paths content (if not already covered).
4. Patch `docs/API_REFERENCE.md` with Convex Quick Reference content (if not already covered).
5. Rewrite CLAUDE.md in new compressed form.
6. Verify:
   - Final line count between 180–230 lines
   - All 15 pitfalls present
   - All 13 business rules present
   - Git workflow rules intact (branch-per-phase, doc-only carve-out, build gate)
   - All pointers in Documentation Index resolve to real files
7. Single commit to `main` (doc-only path, per existing CLAUDE.md rule for `docs/**` + root `*.md`).

## Rollback

If the refactor causes Claude to miss information in practice:

1. Git revert the single commit.
2. New `docs/FILE_MAP.md` survives the revert as an untracked addition (harmless).
3. Identify the specific missing section; either inline it back or make its pointer more prominent.

## Success criteria

- CLAUDE.md final size: 180–230 lines, 11–14KB
- All 15 pitfalls present (grep verify)
- All 13 business rules present (grep verify)
- Git workflow: branch-per-phase rule, doc-only carve-out rule, `npm run build` gate all present (grep verify)
- All `docs/`-relative pointers in the Documentation Index resolve to files that exist and contain the expected content
- `npm run build` unaffected (sanity — this is a doc-only commit)

## Out of scope (for a future pass, if desired)

- Accuracy corrections (schema table count, stale file references, etc.)
- Updating the global `~/.claude/CLAUDE.md`
- Consolidating or trimming memory files
- Restructuring `docs/` itself
