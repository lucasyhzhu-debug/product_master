import { PageHeader } from '@/components/layout/PageHeader';

export function ExpenseAnalytics() {
  return (
    <div>
      <PageHeader
        title="Expense Analytics"
        description="OpEx analysis and fraud monitoring"
      />
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Coming in Phase 50</p>
      </div>
    </div>
  );
}
