import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Info,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ── Types matching backend GapAnalysis shape ──

interface GapAnalysis {
  unmappedProducts: Array<{ name: string; count: number; revenue: number }>;
  zeroCostComponents: Array<{ name: string; code: string }>;
  missingChannels: Array<{
    source: string;
    displayName: string;
    reason: string;
  }>;
  totalMappedProducts: number;
  totalProducts: number;
}

interface ChannelData {
  source: string;
  gross: number;
}

interface DataQualityPanelProps {
  gapAnalysis: GapAnalysis;
  channels: ChannelData[];
}

// ── Coverage color helpers ──

function getCoverageTint(mapped: number, total: number): string {
  if (total === 0) return "bg-muted/30";
  const pct = (mapped / total) * 100;
  if (pct >= 80) return "bg-[var(--color-status-success-bg)]";
  if (pct >= 50) return "bg-[var(--color-status-warning-bg)]";
  return "bg-[var(--color-status-error-bg)]";
}

function getCoverageIcon(mapped: number, total: number) {
  if (total === 0) return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
  const pct = (mapped / total) * 100;
  if (pct >= 80) return <CheckCircle className="h-4 w-4 text-green-500" />;
  return <AlertCircle className="h-4 w-4 text-amber-500" />;
}

export function DataQualityPanel({
  gapAnalysis,
  channels,
}: DataQualityPanelProps) {
  // Detect marketplace shipping gap (Shopee or TikTok with revenue)
  const hasMarketplaceShippingGap = channels.some(
    (ch) =>
      (ch.source === "shopee" || ch.source === "tiktok") && ch.gross > 0
  );

  const issueCount =
    gapAnalysis.unmappedProducts.length +
    gapAnalysis.zeroCostComponents.length +
    gapAnalysis.missingChannels.length +
    (hasMarketplaceShippingGap ? 1 : 0);

  const hasIssues = issueCount > 0;

  // Default open when issues exist, closed when clean
  const [isOpen, setIsOpen] = useState(hasIssues);

  return (
    <Card className="mt-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {hasIssues ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {issueCount} issue{issueCount !== 1 ? "s" : ""} found
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  All clear -- data quality looks good
                </>
              )}
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Coverage stat */}
            <div
              className={cn(
                "rounded-md px-3 py-2 flex items-center gap-2 text-sm",
                getCoverageTint(
                  gapAnalysis.totalMappedProducts,
                  gapAnalysis.totalProducts
                )
              )}
            >
              {getCoverageIcon(
                gapAnalysis.totalMappedProducts,
                gapAnalysis.totalProducts
              )}
              <span>
                {gapAnalysis.totalMappedProducts}/{gapAnalysis.totalProducts}{" "}
                products have BOM-linked COGS
              </span>
            </div>

            {/* Unmapped products */}
            {gapAnalysis.unmappedProducts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  {gapAnalysis.unmappedProducts.length} unmapped product
                  {gapAnalysis.unmappedProducts.length !== 1 ? "s" : ""} --
                  revenue counted, COGS = 0
                </div>
                <ul className="ml-6 space-y-1">
                  {gapAnalysis.unmappedProducts.map((p) => (
                    <li
                      key={p.name}
                      className="text-xs text-muted-foreground flex items-center justify-between"
                    >
                      <span>
                        {p.name}{" "}
                        <span className="text-muted-foreground/60">
                          x{p.count}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/sales?tab=mappings"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-6"
                >
                  Map in Sales Analytics
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Zero-cost components */}
            {gapAnalysis.zeroCostComponents.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  {gapAnalysis.zeroCostComponents.length} component
                  {gapAnalysis.zeroCostComponents.length !== 1 ? "s" : ""} with
                  zero cost -- COGS will be underestimated
                </div>
                <ul className="ml-6 space-y-1">
                  {gapAnalysis.zeroCostComponents.map((c) => (
                    <li
                      key={c.code}
                      className="text-xs text-muted-foreground"
                    >
                      {c.name}{" "}
                      <span className="text-muted-foreground/60">
                        ({c.code})
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/components/production"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-6"
                >
                  Update in Component Types
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Missing channels */}
            {gapAnalysis.missingChannels.length > 0 && (
              <div className="space-y-2">
                {gapAnalysis.missingChannels.map((ch) => (
                  <div
                    key={ch.source}
                    className="flex items-start gap-2 text-sm"
                  >
                    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium">
                        {ch.displayName}:
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {ch.reason}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Seller shipping fees gap warning */}
            {hasMarketplaceShippingGap && (
              <div className="flex items-start gap-2 text-sm">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  Seller shipping fees (Shopee/TikTok) are not yet deducted --
                  Net Revenue for marketplace channels may be overstated
                </span>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
