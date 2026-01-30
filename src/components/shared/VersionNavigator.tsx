import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VersionNavigatorProps {
  currentVersion: number;
  totalVersions: number;
  versionName: string;
  onPrevious: () => void;
  onNext: () => void;
}

export function VersionNavigator({
  currentVersion,
  totalVersions,
  versionName,
  onPrevious,
  onNext,
}: VersionNavigatorProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onPrevious}
        disabled={currentVersion <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-[120px] text-center">
        <span className="text-sm font-medium">
          Version {currentVersion} of {totalVersions}
        </span>
        <p className="text-xs text-muted-foreground truncate">{versionName}</p>
      </div>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={onNext}
        disabled={currentVersion >= totalVersions}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
