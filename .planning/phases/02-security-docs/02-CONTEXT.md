# Phase 2: Quick Fixes — Security & Docs - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve all security concerns (exposed env files, token-in-args pattern, PIN hashing) and formally document accepted security patterns. No sensitive configuration should remain in version control. This is a cleanup and documentation phase — no new security features or auth changes.

</domain>

<decisions>
## Implementation Decisions

### Documentation format
- Standalone `docs/SECURITY.md` — single file, no inline code comments
- Brief rationale per item (2-3 sentences each): state the pattern, why it's accepted, key mitigating factor
- Include a brief threat model section framing the app's security context (internal tool, trusted network, etc.)
- Audience: internal team (casual tone, capturing decisions so we remember why)

### Git history handling
- Rewrite git history using BFG Repo-Cleaner to scrub `.env` and `.env.local.production` from all past commits
- Force-push to main after scrub — small team, can coordinate re-clones
- Rotate all exposed secrets after scrubbing (new Convex deploy keys, update production config)
- Run a quick secrets scan (truffleHog or similar) to catch any other sensitive data in history while we're at it
- `.gitignore` updated to prevent future `.env` commits

### Security doc scope
- SECURITY.md covers the 3 required items (env files, token-in-args, PIN hashing) plus:
  - Brief auth flow documentation (PIN login, session tokens, role-based access)
  - "Known Limitations" section listing security trade-offs consciously accepted
- Does NOT cover: data access matrix (already in CLAUDE.md), deployment security (platform docs handle this)

### Env template design
- Single `.env.example` file (no separate dev/prod templates)
- Include example values showing format: `CONVEX_DEPLOYMENT=dev:your-project-name`
- Group variables as Required vs Optional with comment labels
- `.gitignore` is sufficient prevention — no pre-commit hook or CI check needed

### Claude's Discretion
- Exact BFG Repo-Cleaner invocation and workflow
- Which secrets scanner to use for the broader scan
- Ordering of sections within SECURITY.md
- How to structure the auth flow documentation (narrative vs bullet points)

</decisions>

<specifics>
## Specific Ideas

- Threat model should frame this as an internal FMCG operations tool, not a public-facing application
- Known Limitations section should be honest and useful — list trade-offs like rate limiting gaps if they exist
- `.env.example` should be copy-paste ready: a developer copies it to `.env.local` and only needs to fill in their specific values

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-security-docs*
*Context gathered: 2026-02-13*
