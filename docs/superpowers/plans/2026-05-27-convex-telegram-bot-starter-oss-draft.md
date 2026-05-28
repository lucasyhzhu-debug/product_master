# Open-Source Telegram Bot Starter for Convex

> **Update 2026-05-28:** Self-registration mechanics shipped in Frollie as Phase 85.
> When this OSS starter is extracted, backport `convex/telegram/chatRegistry.ts`
> (verbatim), `convex/telegram/config.ts` (consumer-adapted), and
> `src/pages/TelegramChatsManager.tsx` (UI shell). See porting checklist
> `docs/telegram/self-register-porting.md`.

## Context

We just shipped a Telegram pack-list bot for Frollie (PR #167, merged 2026-05-26 → prod cutover 2026-05-27). The end-to-end journey surfaced a high density of non-obvious traps:

- Convex `.lte("optional_field", X)` includes `undefined` rows (caught by integration test on first impl)
- Telegram webhooks that ACK non-200 after writing a dedupe row cause permanent 500 retry-loops
- Chunking against the 4096-char limit needs per-item guard, not just budget headroom
- BotFather privacy mode silently swallows `/pack` unless explicitly registered via `/setcommands`
- PowerShell splits curl `-d 'allowed_updates=["message"]'` on the `[` bracket — needs single-quote wrap
- WIB-midnight-boundary tests are latent flaky (caught at 00:07 WIB during CI run)
- Plan-stage staffreview + impl-stage triple-review caught complementary classes of bugs (7 fixes between them — 3 Critical impl-only, 8 plan-only)
- Setting prod env vars with a negative chat ID needs `--prod` BEFORE positional args or `key=value` syntax
- Dev + prod sharing one bot needs explicit dev-env-var-removal to prevent duplicate cron sends

These lessons are valuable to any developer building a Telegram bot on a serverless backend. This plan extracts the reusable infrastructure + lessons into a public open-source GitHub repo so others can ship their own bots in hours instead of days.

**Audience:** developers (including beginners) who want to add a "scheduled notifications + on-demand command" Telegram bot to their Convex-backed business system. The repo provides a working starter + opinionated playbook.

**Decisions confirmed with user:**
- Scope: **Convex-specific** starter (not framework-agnostic — keeps signal-to-noise high)
- Examples: **Both** a minimal hello-world AND a sanitized pack-list as an advanced reference
- Guardrails: **Code + docs + scripts** — defensive code, automated secret-scan, pre-commit hook

## Repo Target

**Proposed name:** `convex-telegram-bot-starter`
- Alternative: `convex-telegram-recipes` (if positioning as a cookbook rather than a one-shot template)

**License:** MIT (most permissive — recommend pinning this in `LICENSE` at the root). Tag in `package.json` as `"license": "MIT"`.

**Hosting:** new public repo under `lucasyhzhu-debug/` (the user's existing GitHub org). Can later transfer to a dedicated org if it gains traction.

**Repo URL (target):** `https://github.com/lucasyhzhu-debug/convex-telegram-bot-starter`

## Repo Structure

```
convex-telegram-bot-starter/
├── README.md                      # 5-min quickstart (the front door)
├── SETUP.md                       # Full 0-to-prod playbook (BotFather → cron)
├── SECURITY.md                    # Token/secret discipline, threat model
├── RUNBOOK.md                     # Troubleshooting catalog
├── LESSONS.md                     # Non-obvious traps + memory from the Frollie ship
├── CONTRIBUTING.md                # How to file issues, propose PRs
├── LICENSE                        # MIT
├── package.json                   # deps + scripts
├── tsconfig.json
├── vitest.config.ts
├── .gitignore                     # never commit .env*, .convex/, etc.
├── .env.example                   # placeholder secrets only
├── convex/
│   ├── schema.ts                  # telegramUpdates table (the one universal piece)
│   ├── crons.ts                   # example cron entry, commented
│   ├── http.ts                    # /telegram-webhook route registration
│   ├── lib/
│   │   ├── telegramHtml.ts        # escapeHtml + sendTelegramHtml (UNCHANGED from Frollie)
│   │   ├── telegramHtml.test.ts
│   │   ├── chunking.ts            # NEW — extracted generic chunker with MAX_ITEM_LEN guard
│   │   ├── chunking.test.ts
│   │   └── constantTimeEqual.ts   # NEW — extracted timing-safe compare helper
│   └── telegram/
│       ├── webhook.ts             # Pure decideWebhookOutcome + httpAction + recordIfNew
│       ├── webhook.test.ts
│       ├── README.md              # explains the WebhookDeps pattern
│       └── commands.ts            # NEW — generic command registry (replaces hard-coded /pack)
├── examples/
│   ├── hello-world/               # MINIMAL — just /ping → "pong" + cron that says "good morning"
│   │   ├── README.md              # 5-step setup, no domain logic
│   │   ├── sendHello.ts           # internalAction (cron + /ping → sends one message)
│   │   └── helloFormat.ts         # 5-line formatter
│   └── pack-list/                 # ADVANCED — sanitized Frollie version
│       ├── README.md              # explains pattern: query → formatter → action
│       ├── schema-additions.ts    # the example "orders" + "orderItems" schema
│       ├── seedData.ts            # populates a few demo orders so the example runs
│       ├── packListQuery.ts       # sanitized (no Frollie-specific status names)
│       ├── packListFormat.ts      # sanitized
│       ├── sendPackList.ts        # sanitized
│       └── tests/                 # ported tests
├── scripts/
│   ├── verify-no-secrets.mjs      # greps for known-secret patterns + .env-file leaks
│   ├── new-webhook-secret.mjs     # generates 64-char hex secret (the same one-liner we used)
│   └── register-webhook.mjs       # curl wrapper that handles PowerShell escaping gotcha
└── .github/
    ├── workflows/
    │   ├── test.yml               # CI: vitest + tsc
    │   └── verify-secrets.yml     # CI: runs verify-no-secrets.mjs
    ├── ISSUE_TEMPLATE/
    └── PULL_REQUEST_TEMPLATE.md
```

## Code Extraction Plan

### Reused as-is (only sanitize comments)
- `convex/lib/telegramHtml.ts` — already generic; strip the `convex/integrations/qris/webhooks.ts:18-24` reference (Frollie-only)
- `telegramHtml.test.ts` — 4 tests, generic
- `webhookHandler.test.ts` — 12 tests; rename `/pack` references to a generic `/example` (or parameterize)

### Refactored / abstracted
- **`convex/telegram/webhook.ts`** → split into:
  - `decideWebhookOutcome` (pure core, unchanged signature) — UNCHANGED
  - `recordIfNew` internalMutation — UNCHANGED
  - Hard-coded `/^\/pack(@[A-Za-z0-9_]+)?$/` regex → moved to a `commands.ts` registry where consumers register their command + scheduler call:
    ```ts
    // convex/telegram/commands.ts
    export interface CommandRegistration {
      name: string;            // e.g. "pack"
      action: FunctionReference<"action">;
      args?: Record<string, unknown>;
    }
    export function buildCommandMatcher(commands: CommandRegistration[]) { ... }
    ```
  - Webhook wraps this matcher; example apps register their commands at boot

- **`convex/lib/chunking.ts`** (NEW, extracted from `packListFormat.ts`):
  ```ts
  export interface ChunkerOptions {
    maxChunkLen?: number;       // default 4000 (Telegram safety margin)
    maxItemLen?: number;        // default 3800
    truncateMarker?: string;    // default " …[truncated]"
    continuationHeader?: (chunkIndex: number) => string;
  }
  export function chunkItems(header: string, items: string[], opts?: ChunkerOptions): string[]
  ```
  Reused by hello-world (no chunking needed but still calls it for consistency) + pack-list (full chunking)

- **`convex/lib/constantTimeEqual.ts`** (NEW, extracted from `webhook.ts:34-39`) — single 4-line helper, importable

### Stripped (Frollie-domain code → moved to `examples/pack-list/`)
- The `KanbanOrderCard` type
- The `buildKanbanCard` import
- The `PaymentReceived`/`BeingPrepared` status literals
- The "delivery/pickup" counts
- The `expedited`/`rush` badge logic
- The `wibParts()` WIB-specific date formatter → replace with a parameterized timezone-aware formatter using `Intl.DateTimeFormat({ timeZone })`
- The `morning`/`midday`/`command` reason literals → replace with a generic `headerStyle?: "date-only" | "date-time"` in the formatter API

## Documentation Curriculum

Each doc has a specific job. Total ~12-15 pages of reading for someone going from zero to deployed.

### `README.md` (5-min beginner front door)
- 30-second sales pitch: "Daily/scheduled message bot for your Convex app, 41 tests, MIT"
- Architecture diagram (ASCII): Telegram → webhook → recordIfNew → scheduler → action → sendTelegramHtml
- "Try it locally in 5 minutes" — clone, copy `.env.example`, `npx convex dev`, follow `SETUP.md` step 1-3
- Link out to SETUP / RUNBOOK / SECURITY / LESSONS
- Badges (license, tests, contributions welcome)

### `SETUP.md` (full 0-to-prod playbook)
This is the heart of the package. Step-by-step, exactly the sequence we ran for Frollie, sanitized:

1. **Create your bot via BotFather** — `/newbot`, save token, set privacy mode notes
2. **Generate webhook secret** — `node scripts/new-webhook-secret.mjs` (provided)
3. **Set up your Convex project** — if not already; `npx convex dev --once`
4. **Wire your dev env vars** — `npx convex env set TELEGRAM_BOT_TOKEN ...` (with the chat-id-with-minus gotcha called out)
5. **Discover your chat_id** — create group, add bot, mention bot, hit `getUpdates`
6. **Register the webhook** — using `scripts/register-webhook.mjs` (which handles PowerShell escaping for you)
7. **Set BotFather command list** — `/setcommands` flow (the privacy-mode bypass)
8. **Smoke test** — `npx convex run examples/helloWorld:sendHello`
9. **Prod cutover** — separate bot OR same bot (with the dev-env-var-unset step called out as critical)
10. **Schedule a cron** — example registrations
11. **Verify webhook health** — `getWebhookInfo`

Each step includes:
- Expected command output (sample JSON)
- Common failure mode + what to check
- Cross-link to RUNBOOK when applicable

### `SECURITY.md` (threat model + discipline)
- Threat model: who can `/pack`? what if the webhook secret leaks? what if the bot token leaks?
- Token rotation procedure (revoke via BotFather + reset env var)
- Webhook secret discipline: regenerate per-environment, never reuse dev/prod
- `chat_id` allow-listing (the I4 limitation we shipped + how to harden in v2)
- Constant-time secret compare rationale + the QRIS reference
- Why the bot token never leaves Convex env (never embedded in code, never logged)
- Single-group invariant + when it bites
- `.gitignore` enforcement: `.env*` files, `.convex/`, deployment URLs

### `RUNBOOK.md` (troubleshooting catalog)
One section per error symptom. Each: symptom → likely cause → fix command.
- Webhook silent failure (`pending_update_count` rising) → check `last_error_message`, common causes
- `/pack` doesn't autocomplete in group → BotFather privacy mode + `/setcommands`
- Cron throws "env vars missing" → which deployment, which var
- "Token expired" / 401 from getMe → BotFather token rotation
- PowerShell `URL rejected: Bad hostname` after curl → `[` bracket escaping
- "Diverging branches" on git merge after squash-merged PR → reset-to-origin recipe
- Convex `.lte` returning unexpected rows with optional field → explicit post-filter
- WIB-midnight test flake → anchor pattern from `noonWibTodayMs()`
- Telegram 4096-char limit → check MAX_ITEM_LEN config + truncation marker
- Dev/prod env var leakage causing duplicate cron sends → which deployment has the env vars

### `LESSONS.md` (the non-obvious things)
The 5 lessons from `lessons_telegram_pack_list_triple_review.md` (Convex undefined-in-index, dedupe-before-action retry-loop, per-item chunking guard, plan-stage vs impl-stage review complementarity, `dataModel.d.ts` is generic — port verbatim, sanitized). Plus 3 additional ones surfaced today:
- BotFather privacy mode silently kills `/pack` without `/setcommands`
- PowerShell + curl + `[bracket]` = silent split into 2 curl calls (the second fails)
- `npx convex env set` ordering with negative-value chat IDs

### `CONTRIBUTING.md`
- Issue triage labels (`good-first-issue`, `bug`, `enhancement`)
- PR checklist (tests pass, no secrets, docs updated)
- How to test changes locally before opening a PR
- Pointer to the verify-no-secrets script

## Examples

### `examples/hello-world/` — the 5-minute path
- A single internalAction `sendHello` that posts "👋 Hello from your bot" to the configured chat
- A cron entry that fires `sendHello` once a day at noon UTC
- A `/ping` text command that triggers `sendHello`
- Total: ~60 lines of code, 4 tests
- README: "Read this first. If hello-world works, your setup is correct."

### `examples/pack-list/` — the real-world reference
- Sanitized version of Frollie's pack-list bot
- Bundled `seedData.ts` mutation that populates 3 demo orders so the example runs immediately
- Generic status names (`pending`, `in_progress` instead of `PaymentReceived`, `BeingPrepared`)
- Generic schema (`orders` + `orderItems` tables, minimal columns)
- README: "When you outgrow hello-world: query → format → chunk → send is the pattern. Here's a complete domain example."
- All 41 tests ported with the same naming
- Explicit annotation on each non-obvious decision (chunking guard, dedupe atomicity, post-collect filter for undefined dueDate)

## Guardrails

### Defensive code (already in the template)
- Chunking per-item truncation guard
- Webhook try/catch around `runAction` (the C3 fix)
- Partial-send breadcrumb in sendXxx actions
- Constant-time secret compare
- Atomic `recordIfNew` (single mutation, not read-then-write)
- Post-collect `undefined` filter for optional indexed fields
- Explicit `Promise<...>` return type on internalActions that reference `internal.*` (the circular-type fix)

### `scripts/verify-no-secrets.mjs`
Greps the diff (or full repo when `--full`) for these patterns:
- Telegram bot token shape: `\d{8,12}:[A-Za-z0-9_-]{30,}`
- 64-hex-char webhook secrets: `[a-f0-9]{64}` outside docs/example-only contexts
- Convex deployment URLs: `[a-z-]+\.convex\.(site|cloud)`
- Chat IDs: `-?100\d{10,}`
- `.env*` file additions (warns, doesn't block — sometimes intentional)

Exit code 1 on hit, 0 on clean. Wired into:
- Pre-commit hook (`.husky/pre-commit` example provided)
- CI workflow `.github/workflows/verify-secrets.yml` on every PR

### `scripts/new-webhook-secret.mjs`
```js
console.log(require('crypto').randomBytes(32).toString('hex'));
```
Three lines, but documented in SETUP.md as the One True Way.

### `scripts/register-webhook.mjs`
A node script that takes `{ token, deploymentName, secret }` from argv and POSTs to the Telegram setWebhook API. Handles the PowerShell `[bracket]` escaping issue by JSON-stringifying the body in-script rather than passing it as a curl `-d` shell arg.

### Pre-commit hook (`.husky/pre-commit.sample`)
- Runs `scripts/verify-no-secrets.mjs --staged`
- Runs `npm run type-check`
- Runs `npm run test` on changed files only

## Test Suite

Port all 41 tests:
- 4 HTML escape tests → `convex/lib/telegramHtml.test.ts`
- 16 formatter tests → split: 6 generic ones move to `convex/lib/chunking.test.ts`; 10 stay in `examples/pack-list/tests/`
- 9 query integration tests → all to `examples/pack-list/tests/` (Convex-test against the example schema)
- 12 webhook tests → `convex/telegram/webhook.test.ts` (rename `/pack` → `/example` or `/${TEST_COMMAND}`)

Add 4 new tests for the OSS-specific pieces:
- Command registry: registering 0, 1, 2+ commands; dispatch order; unmatched commands
- Generic chunker: oversized single item, empty input, header-only output
- Constant-time-equal: length mismatch, character mismatch, equal strings
- verify-no-secrets script: positive cases (catches each pattern), negative case (clean repo)

CI matrix:
- Node 22 (matches Frollie's pinned CI version)
- Vitest + tsc --noEmit
- `npx convex codegen --no-deploy` to ensure schema compiles standalone

## Security Review (Pre-Publish Checklist)

Before pushing the repo public, scrub the following:

| Asset | Location | Action |
|---|---|---|
| Bot token `8390266374:AAE...` | Conversation only, not in code | Regenerate via BotFather + revoke old (already in active prod use → coordinate with user) |
| Webhook secret `aeaf8797...` | Conversation only, not in code | Already deployment-scoped; rotate as part of next quarterly secret rotation |
| Chat ID `-5297616765` | Conversation only, not in code | No action needed (private group, no PII exposed) |
| Convex deployment names `exciting-fennec-671`, `decisive-wombat-7` | Not in OSS repo | Replace with `<your-dev-deployment>`, `<your-prod-deployment>` placeholders |
| Frollie business name | Sanitize from all example data | `Frollie` → `Acme Snack Co.` or strip entirely |
| Group name `Frollie · Morning Pack List` | Sanitize from examples | Generic name |
| Customer names in tests | Sanitize (`Sarah K.`, `Andi L.` → `Customer A`, `Customer B`) | Done in port |
| Real product names (`Jumbo`, `Bite Triple`) | Sanitize examples | Generic (`Product A`, `Combo B`) |
| Plan/spec/staffreview/triple-review markdown docs | Some are in the Frollie repo only | Cherry-pick lessons into LESSONS.md, don't copy the originals verbatim |
| `convex/integrations/qris/webhooks.ts` line references in comments | Replace with self-references | "See `convex/telegram/webhook.ts:34` for the pattern" or strip the cross-ref |

Run `verify-no-secrets.mjs --full` as the gate. If it returns clean, the repo is ready.

## Implementation Steps (Wave Order)

**Wave 1: Repo bootstrap** (independent, can be parallelized later)
1. Create new GitHub public repo `convex-telegram-bot-starter`
2. Initialize with README stub, MIT LICENSE, `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`
3. `npx convex dev` against a fresh empty Convex project (separate from `exciting-fennec-671`) — call it `convex-telegram-starter-dev`
4. Commit: `chore: initialize starter repo`

**Wave 2: Core library extraction** (depends on Wave 1)
1. Copy `telegramHtml.ts` + test (sanitize comments)
2. Extract `chunking.ts` from `packListFormat.ts` (parameterize MAX_CHUNK_LEN, MAX_ITEM_LEN, truncate marker)
3. Extract `constantTimeEqual.ts` from `webhook.ts`
4. Write tests for chunking + constantTimeEqual
5. Commit per module: `feat: extract <module>` × 3

**Wave 3: Webhook + command registry** (depends on Wave 2)
1. Copy `webhook.ts` core (`decideWebhookOutcome`, `recordIfNew`, `handleTelegramWebhook`)
2. Add `commands.ts` registry — `buildCommandMatcher(commands)` returns a regex + dispatch table
3. Refactor `decideWebhookOutcome` to take the matcher as a dep
4. Port + adapt the 12 webhook tests
5. Add schema (`telegramUpdates`), http.ts route, crons.ts example
6. Commit: `feat: add webhook handler with command registry`

**Wave 4: Hello-world example** (depends on Wave 3)
1. `examples/hello-world/sendHello.ts` + `helloFormat.ts` (~60 LOC total)
2. Wire into crons.ts + commands.ts as the demo entries
3. Write 4 tests
4. Write `examples/hello-world/README.md`
5. Commit: `feat: hello-world example`

**Wave 5: Pack-list example** (depends on Wave 3, parallel with Wave 4)
1. Sanitized `examples/pack-list/schema-additions.ts` + `seedData.ts`
2. Sanitized `packListQuery.ts`, `packListFormat.ts`, `sendPackList.ts`
3. Port 9 query tests + 10 formatter tests
4. Write `examples/pack-list/README.md`
5. Commit: `feat: pack-list reference example`

**Wave 6: Documentation curriculum** (parallel with Wave 5, after Wave 4)
1. `README.md` — 5-min quickstart
2. `SETUP.md` — full playbook
3. `SECURITY.md` — threat model + discipline
4. `RUNBOOK.md` — troubleshooting catalog
5. `LESSONS.md` — port `lessons_telegram_pack_list_triple_review.md` + add 3 setup-process lessons
6. `CONTRIBUTING.md` — basics
7. Commit per doc: `docs: add <doc>`

**Wave 7: Guardrail scripts** (parallel with Wave 6)
1. `scripts/verify-no-secrets.mjs` (most important)
2. `scripts/new-webhook-secret.mjs`
3. `scripts/register-webhook.mjs`
4. `.husky/pre-commit` sample
5. `.github/workflows/test.yml` + `.github/workflows/verify-secrets.yml`
6. Commit: `feat: add guardrail scripts + CI`

**Wave 8: Pre-publish security scrub** (depends on all above)
1. Run `node scripts/verify-no-secrets.mjs --full` → must be clean
2. Manual grep pass: `grep -r "frollie\|FrolliePackBot\|fennec\|wombat\|8390266374\|aeaf8797\|5297616765" .` → expect 0 matches
3. Sample setup flow: do the full SETUP.md against a clean Convex project, verify each step works as written
4. Push first to a private repo for one round of review; flip to public once verified

**Wave 9: Publish + announce**
1. Flip repo visibility to public
2. Add a tagged release `v0.1.0`
3. Post on dev.to / Hacker News / Convex Discord with a short writeup pointing at LESSONS.md
4. Add to Frollie's own MEMORY.md as a `reference` entry so future Frollie work can point at it

## Critical Files / Patterns to Reuse

These are the load-bearing pieces; the rest is supporting infrastructure.

- `convex/telegram/webhook.ts` line 46-91 — the `decideWebhookOutcome` pure core. **The pattern that prevents the 500-retry-loop.**
- `convex/telegram/webhook.ts` line 101-115 — atomic `recordIfNew` mutation. **The R5 fix.**
- `convex/lib/telegramHtml.ts` line 10-14 — `escapeHtml`. **Order matters (& before <,>).**
- `convex/telegram/packListFormat.ts` line 105-122 — chunking with per-item guard. **The C1 fix.**
- `convex/telegram/packListQuery.ts` line 35-51 — `withIndex` + post-collect `undefined` filter. **The Convex .lte undefined trap.**
- `convex/telegram/sendPackList.ts` line 46-65 — partial-send breadcrumb pattern. **The I2 fix.**
- `convex/staffAttendance/__tests__/correctAttendance.test.ts` line 18-29 (after our PR) — `noonWibTodayMs()` anchor. **The WIB-midnight test flake fix.**

## Verification

End-to-end verification before declaring the repo ready to publish:

1. **Local smoke (hello-world):**
   ```bash
   git clone <new-repo>
   cd convex-telegram-bot-starter
   npm install
   cp .env.example .env.local
   # User fills in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET
   npx convex dev --once
   npx convex run examples/hello-world/sendHello:sendHello
   # Expect: message arrives in Telegram group
   ```

2. **Local smoke (pack-list):**
   ```bash
   npx convex run examples/pack-list/seedData:seed
   npx convex run examples/pack-list/sendPackList:sendPackList '{"reason":"command"}'
   # Expect: pack list with 3 demo orders arrives in Telegram group
   ```

3. **Webhook smoke:**
   ```bash
   node scripts/register-webhook.mjs --token=$TOKEN --deployment=$DEV_NAME --secret=$SECRET
   # Send /ping in the group
   # Expect: "👋 Hello..." reply within 3s
   ```

4. **Guardrail tests:**
   ```bash
   node scripts/verify-no-secrets.mjs --full
   # Expect: clean exit
   npm test
   # Expect: 41 + 4 = 45 tests pass
   npm run type-check
   # Expect: 0 errors
   ```

5. **Doc walkthrough:** have someone unfamiliar (e.g. a different dev) follow SETUP.md cold, top to bottom, against a clean BotFather token. Note where they get stuck → fix the doc.

6. **CI green:** push to a feature branch in the new repo, watch CI go green on test + verify-no-secrets workflows.

7. **Pre-publish secret scrub:** automated + manual grep pass (Wave 8 above). Exit code 0 required before flipping public.

## Estimated Scope

- ~30 files across code + docs + scripts + CI
- ~2,500 lines of code (mostly port from Frollie repo with sanitization)
- ~3,500 lines of docs
- ~150 lines of guardrail scripts
- Realistic completion: 1-2 dev-days of focused work if no surprises

## Open Questions / Decisions To Resolve Pre-Implementation

1. **Repo name** — `convex-telegram-bot-starter` proposed; user has final say
2. **Org** — under `lucasyhzhu-debug/` or a new org? Suggest user account for now; can transfer later
3. **Whether to mirror the conversation's triple-review process as a recommended practice in CONTRIBUTING.md** — adds polish but might be too prescriptive for a starter repo. Suggest YES, but as an optional "advanced practice" section
4. **Whether to include the bot-token rotation script** — adds ops value but more code to maintain. Suggest skip for v0.1.0, add in v0.2.0 if requested
5. **Whether to add a `npx create-convex-telegram-bot` CLI** — would be the ultimate beginner-friendly entry point, but is a separate package. Suggest skip for v0.1.0, evaluate after release
