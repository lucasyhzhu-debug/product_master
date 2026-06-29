# Frollie Recipe Master

What started as a recipe costing tool is now the full operations backbone for an Indonesian FMCG snack business — orders, kitchen production, inventory, multi-channel sales, accounting, payroll, and B2B subscriptions, all on one real-time backend.

Everything is live. Convex pushes changes to every connected screen the moment they happen — no refresh, no cache to bust. Kitchen staff see new orders as order staff type them; managers see margins recompute as ingredient prices change.

**Stack:** Convex (serverless backend + real-time DB) · React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui

---

## Quick Start

```bash
npm install                    # Install dependencies
npx convex dev                 # Terminal 1: backend (dev env)
npm run dev                    # Terminal 2: frontend (localhost:5173)
```

**First run:** open the [Convex Dashboard](https://dashboard.convex.dev) → Functions tab → run `tags:seedDefaults` and `menuProducts:seedDefaults` to seed baseline data.

**Login:** PIN-based. Roles are `kitchen`, `order_staff`, `manager`, `admin`. Each role lands on its own home screen.

---

## What It Does

The app is organized the way staff actually use it: **Orders** front and center, then **Dashboards**, **Ops**, **Finance**, and **Config** menus. Below is every key page and business flow.

### Orders & Fulfillment

- **Order Board** — Real-time kanban across the full lifecycle: Draft → Awaiting Payment → Confirmed → In Production → Boxed → Labeled → Waiting Shipment/Pickup → Complete. Open any order in a slide-over for actions without leaving the board.
- **Order Create** — Build orders item by item with live pricing, voucher application, customer lookup, and a `MMDD-NNN` order number generated for bank-transfer reference.
- **Order Detail** — Full-page view with status controls, payment capture (bank transfer or QRIS), and production status. Kitchen sees it cost-stripped.
- **Invoicing** — Generate and print branded invoices per order, with a finalized print view and invoice numbering.
- **QRIS Payments** — Charge orders via QRIS/Xendit directly from the order surface (gated behind a feature flag pending KYB).
- **WhatsApp Receipts & Templates** — Send order confirmations and receipts over WhatsApp using editable, reusable message templates.
- **Vouchers** — Discount and promo codes with validation rules, applied at order time.

### Kitchen & Production

- **Kitchen View** — Touch-friendly production screen. Balls are produced into trays and **auto-allocate** to the oldest pending orders. Visual package-filling shows progress per order.
- **Clock-In Gate** — Kitchen staff clock in on login before reaching the production screen; attendance feeds performance reports.
- **Production Components** — Manage the production unit catalog (Big Ball / Mid Ball) that the Bill of Materials resolves against.
- **My Performance** — Self-service view of a staff member's own attendance and production output.

### Recipes, Products & Pricing

- **Ingredients / Materials** — Ingredient catalog with unit costs; drives recipe cost-per-gram.
- **Bulk Price Update** — Update many ingredient prices at once; margins recompute everywhere downstream.
- **Menu Products** — Product catalog built on a unified Bill of Materials (`componentTypes` spanning production balls + packaging), with COGS breakdown and contribution-margin analysis. Products pin to specific recipe/packaging versions.
- **Packaging** — Packaging recipes and material tracking with cost roll-up.

### Inventory

- **Inventory Manager** — Stock levels with **FIFO batch tracking**. Stock is reserved on order confirmation, consumed on fulfillment.
- **Locations** — Multi-location inventory (Office, depots, outlets).
- **Stock Count** — Physical-count reconciliation against system stock.
- **Restock Planner** — Forward-looking dispatch/restock planning across locations.

### Sales Channels & Analytics

- **Sales Analytics** — Revenue and volume by channel, with "units sold" counted as BOM-resolved balls (a 3-ball hamper counts as 3), not product rows.
- **Analytics Dashboard** — Unit-economics dashboard (per-ball revenue, cost, margin) with a lifetime hero card.
- **K3Mart Cockpit** — Consignment/retail partner dashboard with sales sync and reconciliation.
- **GoFood Depot** — Manage GoFood depot inventory and channel routing; deductions flow back to inventory.
- **GrabFood Manager + Menu Simulator** — GrabFood order sync and a menu-availability simulator per outlet.
- **POS / ERP Sales Sync** — Pulls platform sales (Shopee, BigSeller, GoFood, GrabFood) incrementally and reconciles them into the ledger; revenue is attributed to the actual platform, not the aggregator.
- **Channel Routing & Audit** — Admin spine that maps outlets→channels, with a product-inventory flag map and an audit workbench for routing/data-quality issues.

### Finance & Accounting

A complete double-entry accounting layer, not just reports.

- **Income Statement** — Real P&L derived from the ledger.
- **Financial Export** — Period exports (Excel/CSV) for the bookkeeper.
- **Expenses** — Submit expenses with receipts, an approval queue, and reimbursement tracking.
- **Expense Analytics** — Spend breakdowns by category and period.
- **Payroll** — Staff payroll runs.
- **Chart of Accounts** — Editable account tree backing every journal entry.
- **Manual Journal Entry** — Hand-post adjusting entries.
- **Bank Accounts, Reconciliation & Rules** — Manage bank accounts, reconcile statements against the ledger, and auto-match transactions via rules.
- **Asset Register** — Fixed-asset tracking with depreciation runs and acquisition journal entries.
- **Historical Import** — Backfill historical expenses and transactions.
- **Staff Performance** — Attendance + production performance reporting for managers.

### CRM & B2B Subscriptions

A customer-relationship layer built on shared CRM design principles (canonical pages, bidirectional links, integer-IDR money that's always traceable to a ledger).

- **CRM Home & Customer Hub** — Customer record as a router to agreements, subscriptions, invoices, and activity — not a scroll-dump.
- **Agreements** — Partner agreements linking a customer to subscription terms and pricing.
- **Subscriptions** — Recurring B2B cafe deliveries: weekly schedule grid, partner pricing, amend (increase *and* decrease) on undelivered days, and credit-funded ad-hoc orders.
- **Subscription Credit** — Customers fund a credit pool; orders reserve against it at creation and draw down at delivery. The funding dashboard shows pool balance and per-week recognition.
- **Weekly Invoicing** — Day-by-day weekly invoices with credit draw-down and a printable view.
- **Customer Activity Timeline** — Derived union over a normalized event log (orders, invoices, ledger) in one shared activity taxonomy.

### Telegram Automation

- **Telegram Chat Registry** — Register bot delivery destinations by role (`pack-list`, `sales-updates`, `subscription-ops`, `founders`) instead of hardcoded chat IDs.
- **Daily Pack List** — Automated production/pack-list push to the kitchen group.
- **Sales Command** — `/sales` query the bot for live sales figures.
- **Subscription Reminders & End-of-Day Summary** — 18:00 WIB founders' digest: shipped-today / weekly-left / credit-remaining.

### Admin & Config

- **Users** — Staff accounts, roles, and PINs.
- **Customers** — Customer directory (deduped by phone).
- **Business Settings** — Company details, default bank, invoice configuration.
- **Help Center** — In-app guides per role.

---

## Access Control

Every route is wrapped in `<ProtectedRoute>` with permission- or role-based access. Auth is PIN login with session tokens; protected mutations require a `token`. Backend enforces roles via `requireRole(ctx, token, [...])`. Full permission table: [`docs/FILE_MAP.md`](docs/FILE_MAP.md).

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Project overview — business rules, pitfalls, file locations, commands |
| [docs/FILE_MAP.md](docs/FILE_MAP.md) | Per-feature file map + full role→route permission table |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Project structure and critical paths |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema and data flows |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Convex queries/mutations + patterns |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | TypeScript/Convex conventions |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow, code review |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth, roles, permissions |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Testing setup |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future plans |

---

## Commands

```bash
# Development
npm run dev              # Frontend dev server
npx convex dev           # Backend dev server (dev env)

# Build & verify (must pass before merge)
npm run build            # tsc + vite build
npm run type-check       # TypeScript only
npm run lint             # ESLint
npm test                 # Vitest unit tests

# Deploy
npm run deploy:check     # Pre-deploy validation (dry run)
npm run deploy:safe      # Validated deploy to production
npx convex dashboard     # Open Convex dashboard
```

---

## Project Structure

```
product_master/
├── convex/              # Backend (Convex serverless)
│   ├── schema.ts        # Database schema (~65 tables)
│   ├── lib/             # Shared utilities (auth, periodRange, ...)
│   ├── reports/         # Platform resolution, production predicates
│   ├── subscriptions/   # B2B subscription + credit logic
│   ├── crm/             # Customer record + activity
│   ├── telegram/        # Bot webhook + chat registry
│   └── [entity]/        # Queries/mutations per entity
├── src/                 # Frontend (React 19)
│   ├── pages/           # Route components (see App.tsx)
│   ├── pages/crm/       # CRM surfaces
│   ├── components/      # UI components (orders/, vouchers/, layout/, ...)
│   ├── hooks/convex/    # Convex React hooks
│   └── lib/             # Utilities (dateUtils, platformColors, ...)
├── docs/                # Documentation
└── CLAUDE.md            # Project context for AI agents
```

See [docs/FILE_MAP.md](docs/FILE_MAP.md) for the per-feature file map.

---

## Environments

| Environment | Deployment | Hosting |
|-------------|-----------|---------|
| Production | `prod:decisive-wombat-7` | Vercel + GitHub Actions CI |
| Development | `dev:exciting-fennec-671` | Local `npx convex dev` |

**CI/CD:** push to `main` → Convex deploy → Vercel rebuild. App URL: `https://frollie-product.vercel.app`.

---

## Contributing

**No direct commits to main for code.** Doc-only commits (`docs/**`, `.planning/**`, `.claude/**`, root `*.md`) may go straight to main.

Code changes:
1. Feature branch from `main` (`git switch -c feature/{name}`)
2. `npm run build` must pass
3. Code review
4. Update `docs/CHANGELOG.md` after merge

See [docs/WORKFLOW.md](docs/WORKFLOW.md).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Convex |
| Frontend | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS 4 |
| UI | shadcn/ui (Radix) |
| Animations | Framer Motion |

---

## License

MIT
