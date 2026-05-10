# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Assumes the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**.

## Dependency categories

When assessing a candidate for deepening, classify its dependencies. The category determines how the deepened module is tested across its seam.

### 1. In-process

Pure computation, in-memory state, no I/O. Always deepenable — merge the modules and test through the new interface directly. No adapter needed.

### 2. Local-substitutable

Dependencies that have local test stand-ins (PGLite for Postgres, in-memory filesystem). Deepenable if the stand-in exists. The deepened module is tested with the stand-in running in the test suite. The seam is internal; no port at the module's external interface.

### 3. Remote but owned (Ports & Adapters)

Your own services across a network boundary (microservices, internal APIs). Define a **port** (interface) at the seam. The deep module owns the logic; the transport is injected as an **adapter**. Tests use an in-memory adapter. Production uses an HTTP/gRPC/queue adapter.

Recommendation shape: *"Define a port at the seam, implement an HTTP adapter for production and an in-memory adapter for testing, so the logic sits in one deep module even though it's deployed across a network."*

### 4. True external (Mock)

Third-party services (Stripe, Twilio, etc.) you don't control. The deepened module takes the external dependency as an injected port; tests provide a mock adapter.

## Seam discipline

- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a port unless at least two adapters are justified (typically production + test). A single-adapter seam is just indirection.
- **Internal seams vs external seams.** A deep module can have internal seams (private to its implementation, used by its own tests) as well as the external seam at its interface. Don't expose internal seams through the interface just because tests use them.

## Testing strategy: replace, don't layer

- Old unit tests on shallow modules become waste once tests at the deepened module's interface exist — delete them.
- Write new tests at the deepened module's interface. The **interface is the test surface**.
- Tests assert on observable outcomes through the interface, not internal state.
- Tests should survive internal refactors — they describe behaviour, not implementation. If a test has to change when the implementation changes, it's testing past the interface.

## Deletion coverage

Deepening is mostly additive — collapsing N shallow modules into one deeper one. But every cutover, refactor, and source-routing change also *removes* a code path or branch. Removals are the highest-risk class of change in this codebase: scope discipline catches what a phase **adds** (it's in the plan); nothing automatically catches what a phase **removes from coverage** unless you charter it explicitly.

### Two failure shapes worth recognizing

**1. Switch-arm deletion silently drops a source.**
Phase 80.2 had a retroactive product-mapping cascade gated `if (args.source === "shopee" || args.source === "tiktok")`. K3Mart was added later as a parent-only source; the cascade was never extended; admin-UI SKU mappings saved cleanly but never patched any `externalRevenue` row. The bug was invisible at the type level — no compiler error, no test failure, no runtime exception. Just silent zero-coverage for one source.

**2. Cutover deletes a side-effect nobody charters.**
Phase 74.5.2 deleted `processSyncSales` (named) and `processGofoodSales` (also named) but the unified replacement path didn't BOM-resolve packaging — sticker auto-deduction quietly disappeared. Result: a daily manual runbook step until Phase 74.5.3 lands. The phase's "what we add" list was correct; the "what we remove from coverage" list didn't exist.

### The deletion-coverage drill

Before deleting any branch, function, or call site that participates in a multi-source / multi-channel / multi-category switch, run this drill:

1. **Enumerate every input domain that hits this code today.** For a switch on `source`, list every literal in the source union (Shopee / TikTok / GrabFood / Consignment / K3Mart / GoBiz / Internal / GoFood). For a switch on `category`, list every category. Don't trust your memory of the union — read the schema validator.

2. **For each input, ask: where does it land after the deletion?** Trace it through. If it lands on a fallback that doesn't preserve the prior behavior, that's a coverage gap. The output of this exercise is a `RETIRES.md` section — see `gsd-spec-phase` for the artifact format.

3. **Replace `if`/`continue` guards with typed-union exhaustion.** A bare `if (source === "shopee" || source === "tiktok")` is a silent-skip waiting for a new source. Prefer `switch (source)` with all cases listed and a `_exhaustive: never` default — the compiler now catches the omission the next time the union grows.

4. **Lift cross-cutting side effects to a typed primitive before deleting any call site that owns them.** If two functions both deduct stickers and you're deleting one, the *capability* must move to a single named module first (e.g. `deductPackagingBOM(orderId)`), so the deletion only removes a caller, not the capability.

### Verification after a deletion

A deepened module that removes coverage should fail loudly, not silently:

- **Sentinel-value test per input domain.** One test per source / category / channel literal, asserting the observable outcome through the interface. A new branch addition has to add a sentinel test or the test list is incomplete by inspection.
- **Audit dashboard or alert.** If coverage CAN drop silently in production (e.g. a flag-gated cutover), instrument the path so coverage-gaps are visible — soft-but-observable beats silent-and-correct-on-paper.
