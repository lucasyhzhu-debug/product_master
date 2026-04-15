import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout";
import { AnalyticsFilterProvider } from "@/contexts/AnalyticsFilterContext";
import {
  AnalyticsFilterBar,
  KpiRow,
  WeekdayDualAxisChart,
  DayHourHeatmap,
  RevPerUnitChart,
  TakeRateTable,
  UnitsByTypeStackedBars,
  UnitsPerTxnByChannel,
  AovByChannel,
  TypeMixOverTime,
  SkuParetoChart,
  SkuChannelHeatmap,
  ChannelSparklineTable,
  RollingTrendChart,
} from "@/components/analytics";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

export function AnalyticsDashboard() {
  return (
    <AnalyticsFilterProvider>
      <div className="space-y-4">
        <PageHeader
          title="Analytics"
          description="Unit economics, channel performance, product mix, and momentum"
        />
        <AnalyticsFilterBar />

        <section>
          <SectionLabel>A · Headline KPIs</SectionLabel>
          <KpiRow />
        </section>

        <section>
          <SectionLabel>B · Time patterns</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <WeekdayDualAxisChart />
            <DayHourHeatmap />
          </div>
        </section>

        <section>
          <SectionLabel>C · Channel economics</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <RevPerUnitChart />
            <TakeRateTable />
          </div>
        </section>

        <section>
          <SectionLabel>D · Volume &amp; product mix</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <UnitsByTypeStackedBars />
            <UnitsPerTxnByChannel />
            <AovByChannel />
            <TypeMixOverTime />
          </div>
        </section>

        <section>
          <SectionLabel>E · Concentration</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <SkuParetoChart />
            <SkuChannelHeatmap />
          </div>
        </section>

        <section>
          <SectionLabel>F · Momentum</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            <ChannelSparklineTable />
            <RollingTrendChart />
          </div>
        </section>
      </div>
    </AnalyticsFilterProvider>
  );
}
