/**
 * Breadcrumbs — chevron-separated trail for CRM object pages.
 * Each segment except the last renders as a React Router Link.
 * The last segment is the current page (plain text).
 *
 * CRM design principle A2: breadcrumbs mirror the object hierarchy.
 */
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface BreadcrumbSegment {
  label: string;
  /** Omit for the current (last) segment, or any segment without a route yet. */
  to?: string;
}

interface BreadcrumbsProps {
  trail: BreadcrumbSegment[];
}

export function Breadcrumbs({ trail }: BreadcrumbsProps) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
      {trail.map((seg, idx) => {
        const isLast = idx === trail.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
            )}
            {isLast || !seg.to ? (
              <span
                className={
                  isLast
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {seg.label}
              </span>
            ) : (
              <Link
                to={seg.to}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {seg.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
