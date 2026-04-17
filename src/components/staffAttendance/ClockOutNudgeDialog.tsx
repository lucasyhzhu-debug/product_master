import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClockOutButton } from "./ClockOutButton";
import type { Id } from "../../../convex/_generated/dataModel";

interface ClockOutNudgeDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  attendanceId: Id<"staffAttendance"> | null;
}

/**
 * D-08: After EndOfShiftForm submit, prompt "Ready to clock out?" — non-blocking.
 * Offers "Stay clocked in" (cancel) or the ClockOutButton action.
 *
 * IMPORTANT — Do NOT wrap ClockOutButton in AlertDialogAction/asChild. AlertDialogAction
 * auto-closes the dialog on click BEFORE the mutation resolves, which causes focus/click
 * races with ClockOutButton's own onClockedOut handler. Render ClockOutButton directly
 * as a plain footer item — it manages its own pending state + toast and closes the
 * dialog via onClockedOut AFTER the mutation settles.
 */
export function ClockOutNudgeDialog({
  open,
  onOpenChange,
  attendanceId,
}: ClockOutNudgeDialogProps) {
  if (!attendanceId) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ready to clock out?</AlertDialogTitle>
          <AlertDialogDescription>
            Your shift record is submitted. You can clock out now or stay clocked in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay clocked in</AlertDialogCancel>
          <ClockOutButton
            attendanceId={attendanceId}
            size="default"
            onClockedOut={() => onOpenChange(false)}
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
