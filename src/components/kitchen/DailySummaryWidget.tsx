/**
 * DailySummaryWidget
 *
 * Collapsible daily summary with:
 *   - Stats grid (balls, orders, boxed, stickers)
 *   - Component production breakdown with per-person attribution
 *   - Ball production per-person breakdown
 *   - Materials consumed list
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveUnit } from '@/lib/componentUnit';

interface DailySummaryWidgetProps {
  stats: {
    ballsProduced: number;
    ordersCompleted: number;
    packagesBoxed: number;
    stickersApplied: number;
    inventoryConsumed: Array<{
      name: string;
      quantity: number;
    }>;
  };
  /** Component production summary from getDailyComponentSummary */
  componentSummary?: Array<{
    code: string;
    name: string;
    /** Display unit. Historical records default to "g". */
    unit?: "g" | "pcs";
    totalProducedGrams: number;
    totalWasteGrams: number;
    perPerson: Array<{
      submittedBy: string;
      chefName?: string;
      producedGrams: number;
      wasteGrams: number;
    }>;
  }>;
  /** Ball production per-person attribution from shift records */
  ballPerPerson?: Array<{
    submittedBy: string;
    chefName?: string;
    totalProduced: number;
    totalWaste: number;
  }>;
}

export function DailySummaryWidget({
  stats,
  componentSummary,
  ballPerPerson,
}: DailySummaryWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-2 border-border bg-card rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-[var(--color-kitchen-success)]" />
          <h3 className="font-bold text-base text-foreground">Today's Summary</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
          {/* Stats Grid — only show stats with data to avoid misleading zeros */}
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="Balls" value={stats.ballsProduced} color="text-[var(--color-station-production)]" />
            {stats.ordersCompleted > 0 && (
              <StatItem label="Orders" value={stats.ordersCompleted} color="text-[var(--color-kitchen-success)]" />
            )}
            {stats.packagesBoxed > 0 && (
              <StatItem label="Boxed" value={stats.packagesBoxed} color="text-[var(--color-station-boxing)]" />
            )}
            {stats.stickersApplied > 0 && (
              <StatItem label="Stickers" value={stats.stickersApplied} color="text-[var(--color-status-info)]" />
            )}
          </div>

          {/* Component Production Breakdown */}
          {componentSummary && componentSummary.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-foreground/80 uppercase mb-2">Component Production</h4>
              <div className="space-y-3">
                {componentSummary.map((comp) => {
                  const unit = resolveUnit(comp.unit);
                  return (
                  <div key={comp.code} className="bg-muted rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{comp.name}</span>
                      <div className="flex items-center gap-2 text-xs tabular-nums">
                        <span className="font-bold text-foreground">{comp.totalProducedGrams}{unit}</span>
                        {comp.totalWasteGrams > 0 && (
                          <span className="text-destructive">-{comp.totalWasteGrams}{unit} waste</span>
                        )}
                      </div>
                    </div>
                    {/* Per-person attribution */}
                    {comp.perPerson.length > 0 && (
                      <div className="space-y-0.5">
                        {comp.perPerson.map((person, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{person.chefName ?? person.submittedBy}</span>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span>{person.producedGrams}{unit}</span>
                              {person.wasteGrams > 0 && (
                                <span className="text-destructive">-{person.wasteGrams}{unit}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ball Production Per-Person */}
          {ballPerPerson && ballPerPerson.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-foreground/80 uppercase mb-2">Production by Person</h4>
              <div className="space-y-1">
                {ballPerPerson.map((person, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded">
                    <span className="text-foreground font-medium">{person.chefName ?? person.submittedBy}</span>
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      <span className="font-semibold">{person.totalProduced} produced</span>
                      {person.totalWaste > 0 && (
                        <span className="text-destructive">{person.totalWaste} waste</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Consumed */}
          {stats.inventoryConsumed.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-foreground/80 uppercase mb-2">Materials Used</h4>
              <div className="space-y-1">
                {stats.inventoryConsumed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded">
                    <span className="text-foreground font-medium">{item.name}</span>
                    <span className="text-muted-foreground font-semibold">{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-muted rounded-lg p-2.5 text-center">
      <div className={cn('text-2xl font-bold tabular-nums', color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 font-semibold">{label}</div>
    </div>
  );
}
