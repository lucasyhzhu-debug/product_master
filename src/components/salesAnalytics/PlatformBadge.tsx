import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import { SOURCE_DISPLAY_NAMES } from "./overviewUtils";

export function PlatformBadge({ platform }: { platform: string }) {
  const palette = getPlatformPalette(platform);
  const displayName = SOURCE_DISPLAY_NAMES[platform] ?? platform;
  return (
    <Badge variant="outline" className={cn(palette.badgeBorder, palette.badgeText)}>
      {displayName}
    </Badge>
  );
}
