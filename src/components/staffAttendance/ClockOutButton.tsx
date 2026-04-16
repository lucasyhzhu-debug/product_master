import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useClockOut } from "@/hooks/convex/useAttendance";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface ClockOutButtonProps {
  attendanceId: Id<"staffAttendance">;
  size?: "sm" | "default" | "lg";
  onClockedOut?: () => void;
}

/**
 * Destructive button that closes the given attendance row. Shows pending state during
 * the mutation, toasts success/error, and invokes `onClockedOut` after the mutation
 * resolves (used by ClockOutNudgeDialog to close the dialog AFTER the mutation — not
 * on click — to avoid racing AlertDialogAction's auto-close).
 */
export function ClockOutButton({ attendanceId, size = "sm", onClockedOut }: ClockOutButtonProps) {
  const clockOut = useClockOut();
  const [pending, setPending] = useState(false);

  const handle = async () => {
    setPending(true);
    try {
      await clockOut({ attendanceId });
      toast.success("Clocked out");
      onClockedOut?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clock-out failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="destructive" size={size} onClick={handle} disabled={pending}>
      <LogOut className="mr-1.5 h-4 w-4" />
      {pending ? "Clocking out…" : "Clock Out"}
    </Button>
  );
}
