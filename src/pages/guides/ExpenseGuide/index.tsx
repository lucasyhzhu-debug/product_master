import { GuideLayout } from "@/components/help";
import type { GuideProps } from "@/lib/helpGuides";
import { OverviewSection } from "./OverviewSection";
import { WalkthroughSection } from "./WalkthroughSection";
import { PayrollSection } from "./PayrollSection";
import { AnalyticsSection } from "./AnalyticsSection";
import { PnlSection } from "./PnlSection";
import { FaqSection } from "./FaqSection";

export function ExpenseGuide({
  title,
  description,
  sections,
  readTimeMinutes,
}: GuideProps) {
  return (
    <GuideLayout
      title={title}
      description={description}
      sections={sections}
      readTimeMinutes={readTimeMinutes}
    >
      <OverviewSection />
      <WalkthroughSection />
      <PayrollSection />
      <AnalyticsSection />
      <PnlSection />
      <FaqSection />
    </GuideLayout>
  );
}
