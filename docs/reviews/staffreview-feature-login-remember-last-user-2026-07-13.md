# Staff Review — `feature/login-remember-last-user` (PR #234)

**Date:** 2026-07-13
**Base:** `c56a576f` (origin/main) → **Head:** `9c12ac42`
**Reviewer:** staff-engineer review (code + design + threat model + UX)
**Diff:** 4 files, +75 / -5

| File | Change |
|------|--------|
| `src/lib/lastUser.ts` | NEW — localStorage get/set/clear for `malo_last_user_id` |
| `src/contexts/AuthContext.tsx` | `setLastUserId(...)` on successful `login()` |
| `src/pages/Login.tsx` | one-shot auto-select effect + `autoSelected` state + copy/label wiring |
| `src/components/auth/PinPad.tsx` | new optional `cancelLabel` prop; action row `max-w-xs` → `max-w-sm`, cancel btn `+text-sm` |

**Verification run:** `npm run type-check` — PASSES (tsc app + tsc convex).

---

## Summary

The feature does exactly what was asked: the last user to sign in on this device is pre-selected, the page opens straight on the PIN pad, and a relabelled "Login as someone else" button returns to the avatar grid. It is small, correctly scoped, and mostly right.

**What's genuinely good:**

- **The failure modes that usually bite this feature are all handled.** Storage disabled / private mode → `try/catch` in all three `lastUser.ts` functions, degrades silently to the avatar grid. Deactivated-or-deleted user → validated against the live `getActiveUsers` result and `clearLastUserId()`'d, so a fired employee doesn't leave a ghost tile. Empty-string key → the `stored ? ... : null` truthiness check covers it.
- **The `autoSelectAttempted` ref is a real bug that was pre-empted, not a cargo-culted guard.** `activeUsers` is a live Convex subscription; without the one-shot ref, any re-emission (a user renamed, an avatar changed, a reconnect) would re-run the effect and *snap the operator back onto the PIN pad after they'd deliberately tapped "Login as someone else."* The comment explains exactly this. Correct call.
- **No new secrets on disk.** Only the `Id<"users">` is persisted — never a PIN, never a token.
- No SSR concern (Vite SPA; the read happens inside `useEffect` regardless). Multi-device works by construction (per-device storage is the desired semantic).

**Where a reviewer here pushes back:** two required-by-CLAUDE.md doc gates are missing (CHANGELOG, SECURITY.md storage-key list), the relabelled button **overflows its container below ~400px viewport width**, and `text-sm` is a dead class. All small. Nothing in this diff is architecturally wrong.

---

## Critical Issues

**None.** No correctness bug, no security regression, no data-integrity risk. Type-check is green.

---

## Improvements (should fix before merge)

### I1 — The relabelled button overflows the card on phone widths (real, computable)

`src/components/auth/PinPad.tsx:156-164`

```tsx
<div className="flex space-x-3 w-full max-w-sm">
  <Button variant="ghost" className="flex-1 text-sm" ...>{cancelLabel}</Button>
  <Button className="flex-1" ...>Sign In <ArrowRight/></Button>
```

`max-w-sm` (384px) is a **max**, not a min — it does not help on a narrow screen, because the container is already narrower than 384px there. The shadcn `buttonVariants` base includes **`whitespace-nowrap`**, and `flex-1` is `flex: 1 1 0%` with `min-width: auto`, so **neither button can shrink below its intrinsic content width and neither can wrap** — they push out of the card instead.

Rough intrinsic widths at `text-sm` / `px-4`: "Login as someone else" ≈ 182px, "Sign In" + arrow ≈ 111px, `space-x-3` = 12px → **~305px minimum**. Available card content width = `viewport − 48 (main p-6) − 48 (card p-6)` = `viewport − 96`. So the row overflows whenever the viewport is **below ~400px** — i.e. iPhone SE (375) and iPhone 12/13/14 (390) both clip or push "Sign In" out of the card. Kitchen tablets are fine; a phone is not.

To be explicit about the question asked: **yes, the width holds at `max-w-sm` on a tablet; no, it does not hold on a phone**, and `max-w-sm` is not what's saving it on the tablet (the numpad's parent is far wider than the pad already).

**Fix (minimal):**

```tsx
<div className="flex space-x-3 w-full max-w-sm">
  <Button variant="ghost" className="flex-1 min-w-0 px-2" onClick={onCancel} disabled={isLoading}>
    <span className="truncate">{cancelLabel}</span>
  </Button>
```

`min-w-0` lets the ghost button shrink; `truncate` degrades the long label gracefully instead of breaking the layout. (Alternative if truncated copy is unacceptable: make the row `flex-col-reverse sm:flex-row` so the switch-user action stacks under Sign In on narrow screens. I'd take the truncate — this is a tablet app and the phone case is a fallback, not the target.)

### I2 — `text-sm` on the cancel button is a dead class

Same block. `buttonVariants` **already** sets `text-sm` in its base string (`src/components/ui/button.tsx:7`). The added `className="flex-1 text-sm"` changes nothing. Remove it — it reads as if it's doing width-management work, and the next person will trust it and be wrong. (If the intent was "make the long label smaller", the class you actually want is `text-xs`, which *would* be an override — but see I1; `min-w-0 + truncate` is the correct lever, not font size.)

### I3 — Missing CHANGELOG entry (project gate)

`CLAUDE.md` → "After every merge to main: Update `docs/CHANGELOG.md` (ALWAYS)". The diff touches no docs. Per the user's versioning scheme (feature = minor), this wants a `## [2.4.0] — 2026-07-13 — Login remembers the last person who signed in` entry with the human-readable one-liner. Add it in this PR, not after.

### I4 — Missing SECURITY.md storage-key entry

`docs/SECURITY.md:22` enumerates what the frontend persists in `localStorage` (`malo_auth_session`). This PR adds a **third** auth-adjacent key (`malo_last_user_id`, joining `malo_auth_session` and `malo_session_id`) and SECURITY.md is the one doc that claims to be the complete list. One line:

> The login page also stores `malo_last_user_id` (the `Id<"users">` of the last successful sign-in on this device) to pre-select that user on the next visit. This value is already public on the login screen — `getActiveUsers` renders every active user's id, name and role in the avatar grid — and it is deliberately *not* cleared on logout.

That sentence is also the audit trail for the threat call below; it belongs in SECURITY.md, not only in a code comment.

---

## Refinements (nice to have, non-blocking)

### R1 — `setLastUserId(userId: string)` should take `Id<"users">`

`src/lib/lastUser.ts:22`. The getter returns `Id<"users">` but the setter accepts a bare `string` — the module is asymmetric and quietly loosens the type at the only call site that matters. `authSession.userId` is already an `Id<"users">`, so tightening the param is free and costs nothing at the call site.

(The unchecked `stored as Id<"users">` in the getter is fine — it's an opaque server-validated id, and `Login.tsx` proves membership in `activeUsers` before it's used for anything. No injection surface.)

### R2 — Give the back-arrow an accessible name

`src/pages/Login.tsx:129-136` — the `ArrowLeft` button is icon-only with no `aria-label`. Pre-existing, but this PR makes it load-bearing as escape hatch #2. `aria-label="Login as someone else"` is a one-word change and makes both escape hatches announce identically.

### R3 — No test

`src/lib/lastUser.ts` is trivially unit-testable (storage-throws → `null`, round-trip, clear), and the *interesting* invariant — "a deactivated last-user is forgotten and the grid is shown" — is exactly the kind of thing that silently regresses when someone later refactors the effect. The repo has `src/pages/__tests__/*.test.tsx` precedent. One small test file for the three storage functions plus the deactivated-user branch would be proportionate. Not a merge blocker for 75 lines.

---

## Design judgment — is the seam right?

**Yes, both calls are right. I would not push back on either.**

**`setLastUserId` in `AuthContext.login` vs. `Login.tsx`'s submit handler.** Putting it in the context is the better of the two. `AuthContext.login` is *the* chokepoint where "a login succeeded" becomes true, and it already owns the two sibling localStorage keys (`malo_auth_session`, `malo_session_id`) — this is a third member of a family that already lives there, not a foreign concern smuggled in. Writing it in `Login.tsx` instead would mean any future second login path (SSO callback, deep-link auto-login, admin impersonation, a native shell) silently fails to record the last user, and the bug would present as "the tablet forgot me" with no obvious cause. The cost is a one-line import from `contexts/` → `lib/`, which is the direction dependencies already flow. The comment on the call site (`// Survives logout: pre-selects this user on the next visit to /login.`) does the necessary work of explaining *why* an auth module is writing a UI-preference key.

**A lib module vs. a `useLastUser` hook.** A module is correct and a hook would be over-engineering. The value is read exactly once, imperatively, inside an effect that also needs `activeUsers` to validate against — there is no reactive subscription to model, no cross-component state to share, and no re-render to trigger. A hook would add a component-lifecycle dependency to something the auth context (a non-component-shaped consumer) also needs to call. `lastUser.ts` sits correctly alongside `sessionBridge.ts` in `src/lib/`.

**Architectural risk / future SSO.** Effectively none, and arguably negative. The coupling introduced is `AuthContext → lib/lastUser` (a leaf module with no imports beyond a type) and `Login.tsx → lib/lastUser`. `AuthContext` does not learn anything about the login *page*; it learns "record who signed in." If PIN login is later replaced by SSO, the `setLastUserId` call either moves to the new success path (one line) or is deleted with the PIN pad (one line). Nothing in this diff makes the auth surface harder to change. The one thing to watch is scope creep on `lastUser.ts` — if someone later adds `lastRole`, `lastLocation`, `rememberMe` to it, *that's* when it needs to become a proper per-device-preferences module with a versioned schema. Today, one key, three functions, no state machine: correct.

---

## Threat / abuse model — shared kitchen tablet

**Verdict: this is not materially worse than the status quo, and I would not gate the merge on it. Ship it.**

The security question only has force if defaulting to a named user *tells an attacker something they didn't already have* or *weakens a control*. It does neither:

- **Disclosure: zero delta.** `getActiveUsers` (`convex/auth/queries.ts:15`) returns **every active user's `_id`, `name`, `role` and `avatarUrl` to an unauthenticated caller**, and `AvatarGrid` renders all of them — name *and* a colour-coded role badge that literally advertises which tile is the admin. An attacker standing at the tablet already has the full roster and knows exactly who to target. Pre-selecting one of them reveals only "this person used this tablet last," which in a four-person kitchen is inferable from looking around the room. If you're worried about the roster being public, the finding is against `getActiveUsers`, not against this PR.
- **Brute force: unchanged.** The rate limit is server-side (`convex/auth/mutations.ts` — `failedAttempts` increments, `lockedUntil = Date.now() + LOCKOUT_DURATION_MS`) and is keyed to the *user*, not the client. Skipping one tap on the avatar grid does not change the number of guesses available. There was never a "select the user" cost to attack through.
- **Shoulder-surfing: unchanged.** The PIN is masked to dots either way, and the target's identity was always one tap from being on screen. The attack that works here (watch the pad, memorise the digits) works identically today.
- **Lockout griefing: unchanged.** Anyone with physical access can already lock out any named colleague from the avatar grid by burning failed attempts on their tile. This PR removes one tap from that, which is not a meaningful change in adversary cost.

**The one genuinely new hazard is not adversarial — it's accidental mis-login.** Staff member B walks up to a tablet defaulted to A, muscle-memory taps their own PIN into A's pad, and burns a failed attempt on A's account. Repeat, and B locks out A without either of them understanding why. The mitigations already in the diff are adequate: A's avatar, A's name, and "Welcome back — enter your PIN" are all on screen above the pad. I'd accept that. **Do not** add "clear lastUser after N failures" — it's speculative, it would silently defeat the feature for someone who just fat-fingered their own PIN, and there's no evidence the failure mode occurs. If lockout-support tickets show up post-ship, revisit then.

---

## UX completeness — is the escape hatch discoverable to "Bu Sri"?

**Both affordances should stay. They are not redundant in the way that matters.**

The back-arrow (`ArrowLeft`, top-left of the card) and the relabelled "Login as someone else" (bottom-left of the action row) both call `handleCancelPinEntry`. Two doors to the same room, which is only a problem if one of them is confusing — and here they're serving genuinely different users:

- The **word button** is the one a non-technical operator will find. It says what it does, in a full sentence, in the place her thumb already is (right next to "Sign In"). That's the affordance this feature needs and it is correctly placed.
- The **back-arrow** is muscle memory for anyone who already uses the app — it's where the "go back to the grid" control has always been, and removing it would break an existing habit for zero gain.

The one incoherence worth naming: on the **auto-selected** path, the back-arrow points "back" to a screen the operator never visited. It's semantically odd (there is no previous step). It's harmless — tapping it lands somewhere sensible — but it's the reason R2 (`aria-label`) is worth doing: a screen-reader user hearing an unnamed "button" next to a name they didn't choose has no idea it's the exit.

Copy is good. "Welcome back — enter your PIN" is the right register, and correctly only appears when the selection was automatic (`autoSelected`), so a manual grid pick still reads "Enter your PIN". Gating `cancelLabel` on `autoSelected` too is the right instinct — "Login as someone else" would be a strange label right after you *chose* someone from a grid, and the code correctly falls back to "Cancel" there.

The `autoSelected` boolean itself is fine. It's *technically* derivable, but the derivation would be subtle and the explicit flag is cheaper to read.

---

## Over/under-engineering

**Nothing is gold-plated.** 75 lines is about right for the ask, and every piece earns its place: `clearLastUserId` looks speculative until you see it's the deactivated-user branch; the `useRef` guard is a live-subscription bug fix; the three `try/catch`es are the storage-disabled case. There is no config flag, no abstraction layer, no premature `rememberMe` toggle — good restraint.

**Nothing important is under-engineered, either.** The four edge cases that typically get missed here — multi-device, private mode, storage-disabled, SSR — are all either handled (private mode / disabled → `try/catch`) or non-issues by construction (per-device is the *point*; no SSR in a Vite SPA). The one thing I'd have expected and didn't find is a test (R3), and the two doc gates (I3/I4).

---

## Verdict

## **SHIP WITH FIXES**

No critical issues, no security regression, type-check green, and the design seam is one I'd defend in a design review. The blocking-ish items are all small and mechanical:

1. **I1** — `min-w-0` + `truncate` on the cancel button (it currently overflows the card below ~400px viewport).
2. **I2** — drop the dead `text-sm`.
3. **I3** — CHANGELOG entry (`2.4.0`), per CLAUDE.md's always-update rule.
4. **I4** — one line in `docs/SECURITY.md` documenting the new `malo_last_user_id` key and the deliberate survives-logout semantic.

R1–R3 (type tightening, `aria-label`, a small test) are follow-up-or-now, reviewer's discretion. With I1–I4 applied this merges as-is.
