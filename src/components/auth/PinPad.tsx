import { useState, useCallback, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Delete, ArrowRight, X } from "lucide-react";
import { Button } from "../ui/button";

interface PinPadProps {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  /** Label for the cancel action. Defaults to "Cancel". */
  cancelLabel?: string;
  isLoading?: boolean;
  error?: string;
  remainingAttempts?: number;
  lockedUntil?: number;
  minLength?: number;
  maxLength?: number;
}

export function PinPad({
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  isLoading = false,
  error,
  remainingAttempts,
  lockedUntil,
  minLength = 4,
  maxLength = 6,
}: PinPadProps) {
  const [pin, setPin] = useState("");
  const [now, setNow] = useState(Date.now);

  // Update 'now' periodically when locked to update countdown
  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = Boolean(lockedUntil && lockedUntil > now);

  const handleDigit = useCallback((digit: string) => {
    if (isLoading || isLocked) return;
    if (pin.length < maxLength) {
      setPin((prev) => prev + digit);
    }
  }, [pin.length, maxLength, isLoading, isLocked]);

  const handleBackspace = useCallback(() => {
    if (isLoading || isLocked) return;
    setPin((prev) => prev.slice(0, -1));
  }, [isLoading, isLocked]);

  const handleClear = useCallback(() => {
    if (isLoading || isLocked) return;
    setPin("");
  }, [isLoading, isLocked]);

  const handleSubmit = useCallback(() => {
    if (pin.length >= minLength && !isLoading && !isLocked) {
      onSubmit(pin);
      setPin(""); // Clear PIN after submit
    }
  }, [pin, minLength, isLoading, isLocked, onSubmit]);

  const canSubmit = pin.length >= minLength && !isLoading && !isLocked;

  // Calculate lockout remaining time
  const lockoutRemaining = isLocked
    ? Math.ceil((lockedUntil! - now) / 60000)
    : 0;

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* PIN Display */}
      <div className="flex items-center justify-center space-x-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full transition-all",
              i < pin.length
                ? "bg-primary scale-110"
                : "bg-muted border-2 border-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* Error / Status Messages */}
      {error && (
        <div className="text-destructive text-sm text-center">
          {error}
          {remainingAttempts !== undefined && remainingAttempts > 0 && (
            <div className="text-xs mt-1">
              {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""} remaining
            </div>
          )}
        </div>
      )}

      {isLocked && (
        <div className="text-destructive text-sm text-center">
          Account locked. Try again in {lockoutRemaining} minute{lockoutRemaining !== 1 ? "s" : ""}.
        </div>
      )}

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <Button
            key={digit}
            variant="outline"
            size="lg"
            className="w-16 h-16 text-2xl font-semibold"
            onClick={() => handleDigit(digit.toString())}
            disabled={isLoading || isLocked}
          >
            {digit}
          </Button>
        ))}

        {/* Bottom row: Clear, 0, Backspace */}
        <Button
          variant="outline"
          size="lg"
          className="w-16 h-16"
          onClick={handleClear}
          disabled={isLoading || isLocked || pin.length === 0}
        >
          <X className="w-5 h-5" />
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-16 h-16 text-2xl font-semibold"
          onClick={() => handleDigit("0")}
          disabled={isLoading || isLocked}
        >
          0
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="w-16 h-16"
          onClick={handleBackspace}
          disabled={isLoading || isLocked || pin.length === 0}
        >
          <Delete className="w-5 h-5" />
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 w-full max-w-sm">
        <Button
          variant="ghost"
          // min-w-0 is required: flex-1 sets min-width:auto and buttonVariants
          // sets whitespace-nowrap, so a long cancelLabel would otherwise
          // overflow the card instead of shrinking (breaks below ~400px).
          className="flex-1 min-w-0 px-2"
          onClick={onCancel}
          disabled={isLoading}
        >
          <span className="truncate">{cancelLabel}</span>
        </Button>

        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <>
              Sign In
              <ArrowRight className="ml-2 w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
