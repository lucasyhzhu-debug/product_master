---
name: persona-uat
description: Run end-to-end persona-driven UAT on a running web app — one browser pass judged by two isolated personas (a non-technical operator + a domain expert), producing a severity-tagged findings report covering bugs AND UX/usability nitpicks. Use when the user asks to "run UAT", "UX test this", "usability review", "persona UAT", or validate a feature end-to-end after triple-review/simplify (especially CRM / POS / customer-facing surfaces).
---

# Persona-Driven UAT

Drive the app **once**, judge it **twice**. Navigation is decoupled from evaluation so the
browser runs a single pass while independent persona sessions evaluate the captured evidence.

## Architecture

```
/persona-uat → uat-orchestrator agent (owns the browser)
   1. ONE Playwright / headed-Chrome pass through every in-scope flow
   2. Writes an evidence pack: screenshots + per-step observed-vs-expected
      + console/network errors + timings  → docs/reviews/uat/<run-id>/
   3. Dispatches TWO isolated evaluator subagents IN PARALLEL (no cross-talk):
        • uat-pos-user   — non-technical operator (UX friction, jargon,
                           missing feedback, unclear money) + functional bugs
        • uat-crm-expert — CRM best practice + project CRM Design Principles
   4. Consolidates → docs/reviews/uat/<run-id>/UAT-FINDINGS.md
```

The two personas run in **separate sessions and never see each other's output** — independence
prevents anchoring bias. They never touch the browser (single-pass guarantee).

Full contract: [docs/reviews/uat/UAT-HARNESS-DESIGN.md](../../../docs/reviews/uat/UAT-HARNESS-DESIGN.md)

## Quick start

1. Ensure a **live env** is running (this repo: `npx convex dev` + `npm run dev`) with seed data
   and a login (manager PIN for CRM surfaces). UAT needs a real running app.
2. Invoke the orchestrator via the Agent tool:

   ```
   Agent(subagent_type="uat-orchestrator", prompt=
     "App URL: http://localhost:5173
      Login: manager PIN <PIN> (role: manager)
      Run-id: phase-d-2026-06-25
      Scope: <list the flows/screens to exercise>
      Spec summary: <1-paragraph of what the feature should do>")
   ```

3. The orchestrator returns the path to `UAT-FINDINGS.md`. Triage: fix BLOCKER/BUG before
   merge; route UX-HIGH/UX-NIT to the backlog or fix if cheap.

## When to run

Run this as the **final gate after** `/triple-review` and `/simplify` — UAT is for the
finished, verified implementation, not work-in-progress. If no live env is available, the
orchestrator reports **"pending: needs live env"** — that is not a pass.

## Scope checklist (compose per feature)

List concrete flows so the single pass covers them. For a CRM surface, include: home/dashboard,
customer record (hub + links), entity pages (subscription, agreement, invoice/week), activity
timeline + filters, money/credit views (ledger statement, gauge, drawdown), and every
empty/loading/error state. Tell the orchestrator to also do a mobile-viewport nav check.
