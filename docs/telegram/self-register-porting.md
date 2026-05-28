# Telegram Self-Registration — OSS Starter Porting Checklist

This is the lift required to take Frollie's Phase 85 self-registration mechanics
(multi-chat routing via a `telegramChats` registry + `/register@<bot>` command)
into a fresh Convex repo or the OSS Convex Telegram Bot Starter.

The design was built **portable from day one** — every Frollie-specific concern
lives in one config module. See the design spec at
`docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` for the full
rationale and `docs/telegram/telegram-bot-integration.md` § "Variant C" for the
schema sketch and lookup pattern.

---

## What ships verbatim vs what you adapt

| Generic — copy verbatim | Adapt per consumer |
|---|---|
| `convex/telegram/chatRegistry.ts` — registry mechanics (`parseCommand`, `getChatIdByRole`, `registerChat`, `touchChatLastSeen`, `listChats`, `assignRole`, `archiveChat`, `restoreChat`, `sendTestMessage`, `seedChatFromEnv`) | `convex/telegram/config.ts` — `KNOWN_TELEGRAM_ROLES` and `TELEGRAM_ADMIN_URL` |
| `convex/telegram/webhook.ts` — `decideWebhookOutcome` command dispatch | `parseCommand` regex — extend with project-specific commands beyond `/pack` |
| `convex/lib/telegramHtml.ts` — already generic | Auth model — `requireRole(ctx, token, ["manager", "admin"])` becomes the consumer's auth pattern |
| `convex/schema.ts` `telegramChats` table definition | Permission gating — Frollie uses `canAccessTelegramChats` (boolean keyof `ROLE_PERMISSIONS`); consumers adapt to their own taxonomy |
| `src/pages/TelegramChatsManager.tsx` UI shell + structure | Role dropdown options — driven by the consumer's `KNOWN_TELEGRAM_ROLES` |
| Tests for pure handlers (regex, lookup chain) | E2E / smoke test against the consumer's actual deployed webhook |

---

## 1. `convex/telegram/chatRegistry.ts` — ships verbatim

This is the entire registry mechanic and is **consumer-agnostic**. It imports its
role allowlist + admin URL from `config.ts` and never hardcodes any
project-specific value. Copy it as-is. The only seam it touches is `config.ts`
(below) and the shared `sendTelegramHtml` helper (already generic).

The env-var fallback inside `getChatIdByRole` is driven by `TELEGRAM_FALLBACK_ROLE`
(not a hardcoded `"pack-list"`), so there are zero Frollie-specific branches —
any consumer points the fallback at whatever role they migrate from, or leaves it
unset on a greenfield install.

## 2. `convex/telegram/config.ts` — the ONLY Frollie-specific surface

This is the single module a consumer adapts. Two values:

```ts
// OSS starter ships with an empty allowlist + a "// add your roles here" comment.
export const KNOWN_TELEGRAM_ROLES = [] as const; // e.g. ["pack-list", "sales-updates"]

export type TelegramRole = (typeof KNOWN_TELEGRAM_ROLES)[number];
export function isKnownTelegramRole(s: string): s is TelegramRole {
  return (KNOWN_TELEGRAM_ROLES as readonly string[]).includes(s);
}

// OSS starter reads from env with a placeholder default.
export const TELEGRAM_ADMIN_URL =
  process.env.TELEGRAM_ADMIN_URL ?? "https://example.com/admin/telegram-chats";
```

- **Roles → `[]`.** Empty array on a fresh install; the consumer adds their own
  semantic delivery roles. Compile-time safety (const-asserted union) comes for free.
- **URL → env.** The `/register` reply links back to the admin page; read it from
  `process.env.TELEGRAM_ADMIN_URL` rather than baking in Frollie's hostname.

## 3. `src/pages/TelegramChatsManager.tsx` — a UI shell to adapt

The admin page is a **structural shell**, not verbatim code. The table layout,
status badge derivation, role dropdown, test-send preview, and archive/restore
flow are reusable, but the consumer wires it to their own auth/permission system
and their own component library. Treat it as a reference implementation:

- Role dropdown options come from the consumer's `KNOWN_TELEGRAM_ROLES`.
- Permission gating swaps `canAccessTelegramChats` for the consumer's taxonomy.
- Styling matches the consumer's existing admin aesthetic.

### Manual recovery for group→supergroup migration

Telegram may upgrade a group to a supergroup, which creates a new chatId (the
old one becomes inert). The current registry does NOT auto-handle
`migrate_to_chat_id` updates (deferred). Manual recovery:

1. In `/admin/telegram-chats`, archive the old chatId row.
2. Add the bot to the new supergroup (it inherits members).
3. Send `/register@<bot>` in the new supergroup.
4. Assign the same role to the new row.
