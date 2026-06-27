# File Map — Where to Touch What

Quick lookup for which backend (`convex/`) and frontend (`src/`) files to modify per feature area. Extracted from `CLAUDE.md` to keep the always-loaded context lean.

**Backend:** `convex/` | **Frontend:** `src/`

| Task | Backend Files | Frontend Files |
|------|---------------|----------------|
| **Schema change** | `convex/schema.ts` | -- |
| **Recipe changes** | `convex/recipes/mutations.ts`, `queries.ts` | `src/hooks/convex/useRecipes.ts`, `src/pages/RecipeEditor.tsx` |
| **Packaging changes** | `convex/packaging/mutations.ts`, `queries.ts` | `src/hooks/convex/usePackaging.ts`, `src/pages/PackagingEditor.tsx` |
| **Product COGS** | `convex/lib/costCalculator.ts`, `convex/products/queries.ts` | `src/pages/ProductEditor.tsx`, `src/components/shared/CostTooltip.tsx` |
| **Order changes** | `convex/orders/mutations/`, `queries.ts` | `src/hooks/convex/useOrders.ts`, `src/pages/OrderDetail.tsx`, `src/pages/OrderManager.tsx` |
| **Kitchen view** | `convex/orders/queries.ts`, `convex/orders/mutations/` | `src/pages/KitchenViewV2.tsx`, `src/components/kitchen/` |
| **Ball distribution** | `convex/orders/helpers/ballDistribution.ts` | -- |
| **Order status transitions** | `convex/orders/helpers/statusTransitions.ts` | -- |
| **WhatsApp templates** | `convex/orders/whatsapp.ts`, `convex/whatsappTemplates/` | `src/pages/WhatsAppTemplatesManager.tsx` |
| **Menu products** | `convex/menuProducts/`, `convex/menuProductComponents/` | `src/pages/MenuProductsManager.tsx`, `src/hooks/convex/useMenuProducts.ts` |
| **Component types (BOM)** | `convex/componentTypes/` | `src/pages/ComponentTypesManager.tsx`, `src/hooks/convex/useComponentTypes.ts` |
| **Inventory** | `convex/inventory/`, `convex/storageLocations/` | `src/pages/InventoryManager.tsx`, `src/pages/LocationsManager.tsx`, `src/hooks/convex/useInventory.ts` |
| **Product inventory (finished goods)** | `convex/productInventory/` (mutations, queries, substitution.ts, stockTracker.ts) | `src/components/inventory/InventoryAvailabilityPanel.tsx`, `src/components/inventory/FulfillFromInventoryButton.tsx` |
| **Vouchers** | `convex/vouchers/` | `src/pages/VouchersManager.tsx`, `src/hooks/convex/useVouchers.ts` |
| **Customers** | `convex/customers/` | `src/pages/CustomersManager.tsx`, `src/hooks/convex/useCustomers.ts` |
| **CRM / Subscriptions weekly cycle (Phase B)** | `convex/subscriptions/scheduling/` (confirmWeek, queries), `convex/subscriptions/weeks.ts` (seedWeek, saveWeekPlan), `convex/subscriptions/invoicing.ts` (createSubscriptionWeeklyInvoice, markWeeklyInvoicePaid, createTopupInvoice, markTopupInvoicePaid), `convex/subscriptions/reconcile.ts`, `convex/subscriptions/outOfCredit.ts`, `convex/subscriptions/recognition.ts`, `convex/subscriptions/reconcileMath.ts`, `convex/subscriptions/weekBounds.ts`, `convex/subscriptions/scheduleLine.ts`, `convex/subscriptions/revenueGate.ts`; `convex/orders/helpers/insertOrder.ts`, `convex/orders/helpers/stripSubscriptionPricing.ts`; schema B0 additions in `convex/schema.ts` (`customerActivity`, `invoices.customerId/indexes`, `orders.by_subscription`, `creditLedger.by_invoice`, `customers.customerType`); C1 gates in `convex/integrations/internal/queries.ts`, `convex/reports/dailySales.ts`, `convex/reports/incomeStatement.ts`; `convex/bankStatements/matchEngine.ts` | `src/pages/crm/SubscriptionSchedulePage.tsx`, `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx`, `src/pages/crm/CrmFundingDashboardPage.tsx`, `src/components/crm/WeekCalendarGrid.tsx`, `src/lib/crmActivityTaxonomy.ts`, `src/App.tsx` (canAccessCrm permission + /crm routes) |
| **Subscription backend consolidation (Phase D Slice 0)** | `convex/subscriptions/recognition.ts` (`recognizeOnDelivery` entry point, 5 call sites repointed), `convex/orders/helpers/stripOrders.ts` (new — `stripOrder`/`stripOrders` seam, 10 call sites in `queries.ts` repointed), `convex/orders/queries.ts` (strip seam adoption), `convex/schema.ts` (`creditLedger.by_type` additive index), `convex/reports/incomeStatement.ts` (drawdown/expiry scans use index), `convex/subscriptions/invoicing.ts` (`buildInvoiceSnapshot` shared builder), `convex/lib/costCalculator.ts` (`accumulateOrderCogs` shared COGS accumulator) | — (backend-only slice; no frontend changes) |
| **CRM surface (Phase D)** | `convex/crm/customers.ts` (updateCustomerCrmFields, getCustomerRecord, getCrmHomeActiveSubscriptions), `convex/crm/agreements.ts` (generateAgreementUploadUrl, createSupplyAgreement, addAgreementVersion, linkAgreementToSubscription, getAgreement, listAgreementsByCustomer, getFileUrl), `convex/crm/ledger.ts` (getCreditLedgerStatement, getWeekBackReferences), `convex/crm/timeline.ts` (logCustomerInteraction, getCustomerTimeline), `convex/crm/drawdown.ts` (getCustomerDrawdown), `convex/crm/helpers/` (currentWeek, drawdownSeries, ledgerStatement, timelineMerge), `convex/lib/activityEvents.ts` (eventTypeToCategory shared taxonomy), `convex/schema.ts` (3 additive indexes: orders.by_customer_orderDate, invoices.by_customer_generatedAt, creditLedger.by_subscription_creationTime), `convex/subscriptions/scheduling/queries.ts` (customerPhone additive field on getFundingDashboard) | `src/pages/crm/CrmHome.tsx`, `src/pages/crm/CustomerDashboard.tsx`, `src/pages/crm/CustomerActivityPage.tsx`, `src/pages/crm/AgreementPage.tsx`, `src/pages/crm/SubscriptionPage.tsx`, `src/components/crm/` (ActivityTimeline, TimelineItem, CreditGauge, DrawdownChart, CreditLedgerStatement, AgreementUpload, WeekBackReferences, DraftWhatsAppButton, ContactLinks, Breadcrumbs, LinkableObject, SubscriptionSelector, ProductLineEditor, DayPlanCell), `src/lib/contactLinks.ts` (buildWaMeUrl etc.), `src/lib/crmActivityTaxonomy.ts` (extended), `src/components/orders/OrderSlideOver.tsx` + `src/pages/OrderDetail.tsx` + `src/components/orders/KanbanCard.tsx` (customer name → CRM link) |
| **Subscription creation & onboarding UI (PR #209, 2026-06-27)** | `convex/crm/customers.ts` (additive: `createCustomer` mutation) | `src/pages/crm/NewSubscriptionPage.tsx` (new), `src/components/crm/SubscriptionForm.tsx` (new), `src/components/crm/ScheduleTemplateEditor.tsx` (new), `src/components/crm/NewCustomerDialog.tsx` (new), `src/lib/crmStatusBadges.ts` (additive: `SUBSCRIPTION_STATUS_BADGE`), `src/pages/crm/CrmHome.tsx` (New customer button), `src/pages/crm/CustomerDashboard.tsx` (Add subscription button + Draft badge), `src/pages/crm/SubscriptionPage.tsx` (Activate action + schedulability guard), `src/App.tsx` (new route `crm/customers/:customerId/subscriptions/new`) |
| **Subscription operate UI — deliver/recognize, top-up, reconcile, out-of-credit (Phase D operate-UI, 2026-06-25)** | `convex/subscriptions/delivery.ts` (`markSubscriptionDelivered`, `isDeliverableSubscriptionStatus`); `convex/subscriptions/amend.ts` (`amendConfirmedWeek`, `computeTopupDelta`); `convex/subscriptions/queries.ts` (`getOrderCreditStatus`, `isOverCredit`); `convex/subscriptions/reconcile.ts` (`reconcileNote` arg + `assertReconcileNote` guard); `convex/schema.ts` (`subscriptionWeeks.reconcileNote` optional field) | `src/components/orders/OrderSlideOver.tsx` (Mark-delivered + out-of-credit flag + Split/Apply-credit — both order surfaces, Pitfall #20); `src/pages/OrderDetail.tsx` (same); `src/components/crm/ReconcileWeekDialog.tsx` (new — fault selector + compulsory comment); `src/pages/crm/SubscriptionWeeklyInvoicePage.tsx` (reconcile action); `src/pages/crm/SubscriptionSchedulePage.tsx` (amend-week mode) |
| **Sales analytics** | `convex/reports/` | `src/pages/SalesAnalytics.tsx`, `src/hooks/convex/useSalesAnalytics.ts` |
| **Unit economics analytics** | `convex/reports/unitEconomics.ts`, `convex/reports/productionUnitHelpers.ts`, `convex/reports/channelTaxonomy.ts`, `convex/reports/revenueHelpers.ts` | `src/pages/AnalyticsDashboard.tsx`, `src/components/analytics/`, `src/hooks/convex/useAnalytics.ts`, `src/contexts/AnalyticsFilterContext.tsx` |
| **Expense analytics** | `convex/expenses/analyticsQueries.ts`, `convex/expenses/fraudHelpers.ts` | `src/pages/ExpenseAnalytics.tsx`, `src/components/expenseAnalytics/`, `src/hooks/convex/useExpenseAnalytics.ts` |
| **Journal import** | `convex/journalImport/mutations.ts` | `src/pages/HistoricalImportPage.tsx`, `src/hooks/convex/useJournalImport.ts`, `src/lib/csvImportValidation.ts` |
| **Manual journal** | `convex/manualJournal/mutations.ts`, `queries.ts` | `src/pages/ManualJournalEntry.tsx`, `src/hooks/convex/useManualJournal.ts` |
| **Financial statement** | `convex/reports/incomeStatement.ts`, `convex/lib/journalHelpers.ts` | `src/pages/FinancialStatement.tsx`, `src/lib/csvExport.ts` |
| **Financial data export (Phase 76)** | `convex/reports/financialExport.ts`, `convex/lib/periodBuckets.ts` | `src/pages/FinancialExportPage.tsx`, `src/components/financialExport/PreflightPanel.tsx`, `src/hooks/useDebouncedValue.ts`, `src/lib/financialExportHelpers.ts` |
| **K3Mart cockpit** | `convex/k3martCockpit/`, `convex/k3martKitchen/` | `src/pages/K3MartCockpit.tsx`, `src/hooks/convex/useK3MartCockpit.ts` |
| **External data (GoFood)** | `convex/externalData/`, `convex/gofoodDepot/`, `convex/integrations/` | `src/hooks/convex/useExternalData.ts` |
| **POS sales sync (source #9)** | `convex/integrations/pos/` (types, fixtures, contractSchema, adapter, recordBuilders, checkpoint, sync), `posSyncCheckpoint` table in `convex/schema.ts`, hourly cron in `convex/crons.ts` | `src/lib/platformColors.ts` (`pos`/`POS`), `src/pages/UnlinkedProductsBackfill.tsx` (SKU mapping), `src/components/salesAnalytics/ProductMappingCard.tsx` |
| **Production targets** | `convex/productionTargets/`, `convex/productionLog/` | -- |
| **Restock planning** | `convex/restock/` | `src/pages/RestockPlanner.tsx` |
| **Tags** | `convex/tags/` | `src/pages/TagsManager.tsx`, `src/hooks/convex/useTags.ts` |
| **Auth / Users** | `convex/auth/`, `convex/lib/auth.ts` | `src/pages/Login.tsx`, `src/pages/UsersManager.tsx`, `src/contexts/AuthContext.tsx` |
| **Cost calculation** | `convex/lib/costCalculator.ts` | `src/components/shared/CostTooltip.tsx` |
| **Fixed assets** | `convex/fixedAssets/mutations.ts`, `queries.ts`, `helpers.ts` | `src/pages/AssetRegister.tsx`, `src/hooks/convex/useFixedAssets.ts`, `src/components/assets/` |
| **Bank reconciliation** | `convex/bankStatements/` (mutations, queries, matchEngine, channelMapping), `convex/bankKeywordRules/` (mutations, defaultRules), `convex/lib/journalEngine.ts` (bank_statement_reversal sourceType), `convex/lib/indonesianDate.ts` | `src/pages/BankReconciliationPage.tsx`, `src/pages/BankRulesManager.tsx`, `src/pages/AssetRegister.tsx` (CapEx round-trip), `src/hooks/convex/useBankReconciliation.ts`, `src/components/bankReconciliation/` (17 components: SplitViewWorkspace, BankLinesPane, CandidatesPane, ReconciliationActionBar, StatementProgressHeader, BatchConfirmDialog, LearnFromOverrideDialog, InlineExpenseDialog, InlineRevenueDialog, InlineReimbursementDialog, SearchAllRecordsDialog, RevenueGapTab, ReversedIndicator, ConfidenceBadge, etc.), `src/components/expense/ExpenseSubmitForm.tsx`, `src/lib/bankStatement/` |
| **Tutorial walkthroughs** | -- | `src/components/help/walkthrough/`, `src/components/help/WalkthroughPlayer.tsx` |
| **Add new page** | `convex/schema.ts`, `convex/[entity]/queries.ts`, `mutations.ts` | `src/App.tsx` (route), `src/pages/[Page].tsx`, `src/hooks/convex/use[Entity].ts` |
| **Access control** | `convex/lib/auth.ts`, `convex/[entity]/mutations.ts` | `src/components/auth/ProtectedRoute.tsx`, `src/App.tsx` |

---

## Full Role → Route Permission Table

All routes use `<ProtectedRoute>` with permission-based or role-based access. Auth is PIN login with session tokens.

**Roles:** `kitchen`, `order_staff`, `manager`, `admin`

| Page | Permission / Roles | Notes |
|------|-------------------|-------|
| Login | Public | Only unauthenticated |
| Dashboard | `canAccessDashboard` | Manager, Admin |
| Kitchen / Kitchen V2 | `canAccessKitchen` | All roles |
| Packaging View | `canAccessPackaging` | All roles |
| Orders | `canAccessOrders` | Order Staff, Manager, Admin |
| Order Detail | Roles: order_staff, manager, admin, kitchen | Kitchen sees no costs |
| Recipes / Packaging Editor | `canAccessRecipes` | Manager, Admin |
| Product Editor | `canAccessProducts` | Manager, Admin |
| Ingredients | `canAccessIngredients` | Manager, Admin |
| Materials | `canAccessMaterials` | Manager, Admin |
| Menu Products | `canAccessMenuProducts` | Admin |
| Users | `canAccessUsers` | Admin |
| WhatsApp Templates | `canManageWhatsAppTemplates` | Manager, Admin |
| Vouchers | `canAccessVouchers` | Admin |
| Inventory / Locations / Components | `canAccessInventory` | Manager, Admin |
| Customers | `canAccessOrders` | Order Staff, Manager, Admin |
| Sales Analytics | `canAccessDashboard` | Manager, Admin |
| K3Mart Cockpit | `canAccessDashboard` | Manager, Admin |
| Tags | `canAccessIngredients` | Manager, Admin |
| Restock Planner | `canAccessInventory` | Manager, Admin |
| Historical Import | `canManageReimbursements` | Admin |
| Asset Register | `canAccessAssets` | Manager, Admin |
| Financial Data Export (`/financials/export`) | Roles: manager, admin | Phase 76 — Raw GL + multi-period P&L CSV exports for accountant handoff. Backend queries also enforce `requireRole(["manager","admin"])`. |
| Telegram Chats (`/admin/telegram-chats`) | `canAccessTelegramChats` | Manager, Admin | Phase 85 — register/assign-role/archive Telegram delivery chats. Backend writes enforce `requireRole(["manager","admin"])`. |
| CRM — Subscription Calendar (`/crm/customers/:id/subscriptions/:subId/week`) | `canAccessCrm` | Manager, Admin | Phase B — weekly schedule calendar, confirm→orders, invoice, mark-paid. Backend enforces `requireRole(["manager","admin"])` on all subscription mutations/queries. |
| CRM — Subscription Invoice (`/crm/customers/:id/subscriptions/:subId/week/invoice`) | `canAccessCrm` | Manager, Admin | Phase B — day-by-day invoice view, mark-paid→fund. |
| CRM — Funding Dashboard (`/crm/funding`) | `canAccessCrm` | Manager, Admin | Phase B — list weeks awaiting invoice or payment; mark-paid→fund. |
| CRM — Home (`/crm`) | `canAccessCrm` | Manager, Admin | Phase D — active subscription list + needs-funding list; Draft-WhatsApp button. |
| CRM — Customer Dashboard (`/crm/customers/:customerId`) | `canAccessCrm` | Manager, Admin | Phase D — customer hub: credit gauge, drawdown chart, unpaid invoices, Draft-WhatsApp reminder. Backend enforces `roles: ["manager","admin"]` on all `convex/crm/*` functions. |
| CRM — Customer Activity (`/crm/customers/:customerId/activity`) | `canAccessCrm` | Manager, Admin | Phase D — merged timeline feed, 14d window, type-category filter, "Load older". |
| CRM — Agreements (`/crm/customers/:customerId/agreements`) | `canAccessCrm` | Manager, Admin | Phase D — supply agreement upload (Convex storage), version history, subscription link. |
| CRM — Subscription (`/crm/customers/:customerId/subscriptions/:subId`) | `canAccessCrm` | Manager, Admin | Phase D — subscription detail hub. |
| Orders / Order Detail — Subscription operate actions | `canAccessOrders` (page) + `isManagerOrAdmin` (action gate) | Manager, Admin (actions only) | Phase D operate-UI — "Mark delivered", out-of-credit flag, Split/Apply-credit buttons scoped to manager+admin inside the subscription read-only block. `getOrderCreditStatus` query skip-guarded with `isManagerOrAdmin` to prevent Pitfall #19 crash for order_staff. |
| CRM — Reconcile week dialog (`ReconcileWeekDialog`) | `canAccessCrm` | Manager, Admin | Phase D operate-UI — fault selector + compulsory reconcile comment. Shown for week statuses `paid`/`delivering`. |
| CRM — Amend week mode (`SubscriptionSchedulePage`) | `canAccessCrm` | Manager, Admin | Phase D operate-UI — locally unlocks a confirmed week's grid; calls `amendConfirmedWeek`; reports top-up delta. |
| CRM — New subscription (`/crm/customers/:customerId/subscriptions/new`) | `canAccessCrm` | Manager, Admin | PR #209 — full-page subscription creation: terms + 7-day schedule template + optional agreement + live preview + validation → Draft subscription. |

**Backend enforcement:** `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts`. Add `token: v.string()` to protected mutation args.

---

## Telegram Pack List Bot v1 (2026-05-26)

Notifications + on-demand `/pack` command in a dedicated Telegram group. No frontend code.

- **Backend (orchestration):** `convex/telegram/sendPackList.ts` (internalAction), `convex/telegram/webhook.ts` (pure `decideWebhookOutcome` + httpAction + `recordIfNew` internalMutation)
- **Backend (pure logic):** `convex/telegram/packListFormat.ts` (formatter), `convex/lib/telegramHtml.ts` (escape + send helper)
- **Backend (query):** `convex/telegram/queries/packListQuery.ts` (`getOrdersForPackList` internalQuery; reuses `convex/orders/helpers/kanbanBuilders.ts → buildKanbanCard`)
- **Schema:** `convex/schema.ts` — `telegramUpdates` table (index `by_update_id`) for webhook idempotency dedupe
- **Crons:** `convex/crons.ts` — `telegram morning pack list` (00:00 UTC = 07:00 WIB), `telegram midday pack list` (06:00 UTC = 13:00 WIB)
- **HTTP route:** `convex/http.ts` — `POST /telegram-webhook`
- **Tests:** `convex/lib/__tests__/telegramHtml.test.ts`, `convex/telegram/__tests__/{packListFormat,packListQuery,webhookHandler}.test.ts` (41 tests total)
- **Env vars:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` (each set separately per Convex deployment via `npx convex env set`)
- **Permission:** webhook is unauthenticated externally (token-in-header, constant-time compare). Convex functions are internal-only (no `requireRole` — read-only feature, any group member can `/pack`). Single-group invariant is operational (the handler does NOT verify `chat_id`; keep the bot in exactly one group).

---

## Telegram chat registry (Phase 85, 2026-05-28)

Self-registration + role-based multi-chat routing. Replaces the single `TELEGRAM_CHAT_ID` env var with the `telegramChats` registry; send-actions resolve chat IDs by semantic role at send time. Adds a gated admin page.

- **Backend (registry):** `convex/telegram/chatRegistry.ts` (`parseCommand`, `getChatIdByRole` internalQuery, `touchChatLastSeen`, `registerChat`/`replyStartHelp`, `listChats` query, `assignRole`/`archiveChat`/`restoreChat` mutations, `sendTestMessage` action, `seedChatFromEnv` internalAction)
- **Backend (config):** `convex/telegram/config.ts` (`KNOWN_TELEGRAM_ROLES`, `isKnownTelegramRole`, `TELEGRAM_ADMIN_URL` — the only Frollie-specific surface, kept isolated for OSS portability)
- **Backend (touched):** `convex/telegram/webhook.ts` (multi-command dispatch + non-command `touchChatLastSeen`), `convex/telegram/sendPackList.ts` (resolves via `getChatIdByRole("pack-list")`)
- **Schema:** `convex/schema.ts` — `telegramChats` table (indexes `by_chatId`, `by_role_archived`)
- **Frontend:** `src/pages/TelegramChatsManager.tsx` (admin page), `src/hooks/convex/useTelegramChats.ts` (hook module)
- **Route:** `/admin/telegram-chats` (lazy, `<ProtectedRoute requiredPermission="canAccessTelegramChats">`)
- **Env vars:** new `TELEGRAM_FALLBACK_ROLE` (set to `pack-list` during migration window); existing `TELEGRAM_CHAT_ID` retained as fallback until cutover.
- **Permission:** `canAccessTelegramChats` (`src/lib/types.ts`) — manager + admin. Backend write mutations/actions use `requireRole(ctx, token, ["manager", "admin"])` (symmetric per Pitfall #19).

---

## Telegram sales-updates bot (2026-05-29)

Daily/weekly/monthly sales round-ups posted to a Telegram group via the Phase 85 role-based registry (`sales-updates` role). No frontend code, no schema change.

- **Backend (orchestrator):** `convex/telegram/salesSummary/sendSalesSummary.ts` (internalAction — best-effort data refresh then query + format + send to `sales-updates` role)
- **Backend (query):** `convex/telegram/salesSummary/salesSummaryQuery.ts` (`getSalesSummary` internalQuery — gross revenue + per-SKU by channel/outlet, period-over-period deltas, excludes non-sales/return rows)
- **Backend (formatter):** `convex/telegram/salesSummary/salesSummaryFormat.ts` (pure formatter: `SalesSummaryData → string[]` Telegram HTML, delta badges ▲/▼, 4000-char chunk budget (under Telegram's 4096 limit))
- **Backend (helper):** `convex/telegram/salesSummary/range.ts` (cadence → WIB date-range, pure function)
- **Crons:** `convex/crons.ts` — `sales summary daily` (23:00 WIB = 16:00 UTC), `sales summary weekly` (Mon 07:00 WIB = Mon 00:00 UTC), `sales summary monthly` (1st 08:00 WIB = 1st 01:00 UTC). **Removed:** `bigseller nightly 7d resync` — `nightlySync` (BigSeller/Shopee) is now on-demand only; this retires Phase 79's DA-12 automatic trailing-7-day Shopee backfill.
- **Tests:** `convex/telegram/salesSummary/__tests__/{range,salesSummaryQuery,salesSummaryFormat}.test.ts`
- **Operator step:** assign a Telegram group to the `sales-updates` role via `/admin/telegram-chats` (Phase 85 registry — no env vars needed).
