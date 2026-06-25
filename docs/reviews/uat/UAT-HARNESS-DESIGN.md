# UAT Harness Design — Persona-Driven, Single-Pass Navigation

> Shared contract for the three UAT agents (`uat-orchestrator`, `uat-pos-user`, `uat-crm-expert`)
> and the `/persona-uat` skill. All three MUST conform to the evidence-pack and findings formats
> below so navigation happens **once** and is judged by **two isolated persona sessions**.

## Architecture (why it's shaped this way)

Navigation is expensive and flaky; evaluation is cheap and benefits from multiple lenses.
So we **decouple** them:

1. **Orchestrator owns the browser.** It runs ONE pass through every in-scope flow and writes
   a self-contained *evidence pack* (screenshots + structured per-step observations).
2. **Personas never touch the browser.** Each persona is a fresh subagent that READS the same
   evidence pack and emits findings through its lens. They run in **separate sessions and never
   see each other's output** (dispatched in parallel by the orchestrator; no shared context).
3. **Orchestrator consolidates** both findings sets into one severity-tagged report.

This guarantees: single navigation (optimization), independent judgement (no anchoring bias
between personas), reproducible artifacts (the pack is the source of truth a human can re-open).

## Run layout

Each run writes to: `docs/reviews/uat/<run-id>/`  (run-id = `phase-d-YYYY-MM-DD` or caller-supplied)

```
docs/reviews/uat/<run-id>/
  context.md            # what was tested, app URL, role/PIN used, seed summary, scope checklist
  flow-log.md           # the ordered evidence pack (see format)
  screens/              # screenshots, one+ per step, named NN-<slug>.png
  console-errors.log    # all browser console errors/warnings captured
  network-failures.log  # non-2xx/3xx requests, failed loads
  findings-pos-user.md      # written by uat-pos-user (persona evaluator)
  findings-crm-expert.md    # written by uat-crm-expert (persona evaluator)
  UAT-FINDINGS.md       # consolidated, deduped, attributed — the deliverable
```

## Evidence pack — `flow-log.md` format (written by orchestrator)

One block per step, in navigation order. Personas rely ONLY on this + screenshots + logs.

```
## Step <N> — <Flow name> — <screen/route>
- **Action:** what the orchestrator did (click X, type Y, navigate to Z)
- **Expected:** the intended outcome per the feature spec
- **Observed:** what actually happened (be literal; quote visible text/labels)
- **Screenshot:** screens/NN-<slug>.png
- **Console:** none | <summary, full detail in console-errors.log>
- **Network:** none | <summary, full detail in network-failures.log>
- **Load:** <ms or qualitative: instant/snappy/laggy/spinner-stuck>
- **State:** ok | warn | broken
```

The orchestrator must capture not just happy paths but: empty states, loading states, error
states, long values/overflow, mobile viewport for nav, and any dead-click / no-feedback moments
(these are the raw material UX personas need).

## Persona findings — `findings-<persona>.md` format (written by each persona)

Each persona emits a flat list. Every finding:

```
### [<SEVERITY>] <short title>
- **Where:** Step <N> / <screen> (screens/NN-...png)
- **What:** the issue, concretely
- **Why it matters (<persona> lens):** the persona's reasoning
- **Suggested fix:** actionable
```

**Severity vocabulary (shared):**
- `BLOCKER` — cannot complete a core task; data loss/corruption; crash.
- `BUG` — functional defect, wrong data, broken link, but task still completable.
- `UX-HIGH` — usability problem that will confuse/slow the target user materially.
- `UX-NIT` — polish: wording, alignment, affordance clarity, microcopy.

Personas MUST flag UX-HIGH/UX-NIT, not only bugs. A clean functional pass with poor UX is a FAIL
for the POS-user persona.

## Persona definitions

### uat-pos-user — "Bu Sri", non-technical shop operator
- Runs the POS day-to-day; comfortable with WhatsApp and Tokopedia, NOT with software jargon.
- Judges: can I tell what this screen is for? Is the next action obvious? Did my click do
  something visible? Are money numbers clear and trustworthy? Is anything scary/ambiguous
  (delete, irreversible)? Are empty/loading/error states reassuring or confusing?
- Flags confusing labels, hidden affordances, missing feedback, jargon, dense layouts,
  AND functional bugs she trips over.

### uat-crm-expert — senior CRM practitioner (Salesforce/HubSpot background)
- Reviews against the **4 themes / 12 CRM Design Principles** embedded in the agent (and in
  CLAUDE.md "## CRM Design Principles"): A1–A4 navigation & linking, B5–B8 data model & taxonomy,
  C9–C10 density & money, D11–D12 access & states.
- Flags: broken/one-way entity links, timeline gaps or miscategorized events, untraceable money,
  scroll-dump layouts, missing back-references, and data-model visibility problems.

## Consolidation — `UAT-FINDINGS.md` (orchestrator)
- Merge both persona files; dedupe by (screen + issue); attribute each to `POS`, `CRM-EXPERT`,
  or `BOTH`. Sort by severity then screen. Link screenshot for each. Add a one-paragraph
  executive summary (overall readiness verdict + count by severity). This file is the deliverable.

## Live-env requirement
UAT needs a running app: `npx convex dev` + `npm run dev` + a manager PIN + seed data. If no live
env is available, the orchestrator reports **"pending: needs live env"** and does NOT claim a pass.
