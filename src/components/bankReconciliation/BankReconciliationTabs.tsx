/**
 * BankReconciliationTabs — top-level tab shell for /bank-reconciliation.
 *
 * Tabs: Statements | Review | Revenue Gap | Rules.
 * URL query `?tab=…` is the source of truth so deep links from
 * dashboards (D-15) survive refresh. Other params (e.g. statementId)
 * are preserved across tab changes.
 *
 * UI-SPEC §6.1.
 */

import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type BankTab = "statements" | "review" | "revenue-gap" | "rules";

const VALID_TABS: readonly BankTab[] = ["statements", "review", "revenue-gap", "rules"];

interface Props {
  statements: ReactNode;
  review: ReactNode;
  revenueGap: ReactNode;
  /** Default tab when the URL has no `?tab=` param. */
  defaultTab?: BankTab;
}

export function BankReconciliationTabs({
  statements,
  review,
  revenueGap,
  defaultTab = "statements",
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const raw = searchParams.get("tab");
  const tab: BankTab =
    raw && (VALID_TABS as readonly string[]).includes(raw) ? (raw as BankTab) : defaultTab;

  function handleChange(next: string) {
    if (next === "rules") {
      // Rules tab is a shortcut into the dedicated /bank-rules page so admins
      // get the existing CRUD shell. Managers are bounced by the route gate.
      navigate("/bank-rules");
      return;
    }
    setSearchParams(
      (prev) => {
        const np = new URLSearchParams(prev);
        np.set("tab", next);
        return np;
      },
      { replace: true },
    );
  }

  return (
    <Tabs value={tab} onValueChange={handleChange} className="w-full">
      <TabsList className="bg-transparent border-b border-border h-auto p-0 rounded-none w-full justify-start gap-2">
        <TabsTrigger
          value="statements"
          className="rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:font-semibold text-muted-foreground"
        >
          Statements
        </TabsTrigger>
        <TabsTrigger
          value="review"
          className="rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:font-semibold text-muted-foreground"
        >
          Review
        </TabsTrigger>
        <TabsTrigger
          value="revenue-gap"
          className="rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:font-semibold text-muted-foreground"
        >
          Revenue Gap
        </TabsTrigger>
        <TabsTrigger
          value="rules"
          className="rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:font-semibold text-muted-foreground"
        >
          Rules
        </TabsTrigger>
      </TabsList>

      <TabsContent value="statements" className="mt-4">
        {statements}
      </TabsContent>
      <TabsContent value="review" className="mt-4">
        {review}
      </TabsContent>
      <TabsContent value="revenue-gap" className="mt-4">
        {revenueGap}
      </TabsContent>
      <TabsContent value="rules" className="mt-4">
        {/* Rules tab triggers a route navigation in handleChange — this body
            briefly renders if the user lands on ?tab=rules directly. */}
        <div className="rounded-md border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          Opening Bank Rules manager…
        </div>
      </TabsContent>
    </Tabs>
  );
}
