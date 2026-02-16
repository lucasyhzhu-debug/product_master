import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useProtectedMutation } from '@/hooks/convex/useProtectedMutation';
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';
import { ConvexError } from 'convex/values';

interface TargetConfigPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: { maxProductionTarget: number; bigBallTarget: number; midBallTarget: number };
  children: React.ReactNode;
}

export function TargetConfigPopover({
  open,
  onOpenChange,
  currentConfig,
  children,
}: TargetConfigPopoverProps) {
  const [maxTarget, setMaxTarget] = useState(currentConfig.maxProductionTarget);
  const [bigBalls, setBigBalls] = useState(currentConfig.bigBallTarget);
  const [midBalls, setMidBalls] = useState(currentConfig.midBallTarget);
  const [saving, setSaving] = useState(false);

  const updateConfig = useProtectedMutation(api.kitchenConfig.mutations.updateConfig);

  // Sync local state when config changes externally or popover opens
  useEffect(() => {
    if (open) {
      setMaxTarget(currentConfig.maxProductionTarget);
      setBigBalls(currentConfig.bigBallTarget);
      setMidBalls(currentConfig.midBallTarget);
    }
  }, [open, currentConfig.maxProductionTarget, currentConfig.bigBallTarget, currentConfig.midBallTarget]);

  const compositionError = bigBalls + midBalls !== maxTarget;

  const handleMaxChange = (val: number) => {
    const prev = maxTarget;
    setMaxTarget(val);
    if (prev > 0) {
      // Keep the ratio when max changes
      const ratio = bigBalls / prev;
      const newBig = Math.round(val * ratio);
      setBigBalls(newBig);
      setMidBalls(val - newBig);
    } else {
      setBigBalls(val);
      setMidBalls(0);
    }
  };

  const handleBigChange = (val: number) => {
    setBigBalls(val);
    setMidBalls(maxTarget - val);
  };

  const handleMidChange = (val: number) => {
    setMidBalls(val);
    setBigBalls(maxTarget - val);
  };

  const handleSave = async () => {
    if (compositionError) return;
    setSaving(true);
    try {
      await updateConfig({
        maxProductionTarget: maxTarget,
        bigBallTarget: bigBalls,
        midBallTarget: midBalls,
      });
      toast.success('Target updated');
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Production Target</h4>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="max-target" className="text-xs">Max Target</Label>
              <Input
                id="max-target"
                type="number"
                min={1}
                value={maxTarget}
                onChange={(e) => handleMaxChange(Number(e.target.value) || 0)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="big-balls" className="text-xs">Big Balls</Label>
                <Input
                  id="big-balls"
                  type="number"
                  min={0}
                  value={bigBalls}
                  onChange={(e) => handleBigChange(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mid-balls" className="text-xs">Mid Balls</Label>
                <Input
                  id="mid-balls"
                  type="number"
                  min={0}
                  value={midBalls}
                  onChange={(e) => handleMidChange(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            {compositionError && (
              <p className="text-xs text-destructive">
                Big ({bigBalls}) + Mid ({midBalls}) = {bigBalls + midBalls}, must equal Max ({maxTarget})
              </p>
            )}
          </div>

          <Button
            className="w-full"
            size="sm"
            onClick={handleSave}
            disabled={compositionError || saving || maxTarget <= 0}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
